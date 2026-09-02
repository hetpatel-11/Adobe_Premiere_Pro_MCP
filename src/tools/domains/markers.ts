/**
 * Sequence markers.
 *
 * Each entry declares the tool an agent sees and the handler that runs it,
 * so the two cannot drift apart. Handlers reach Premiere through ToolContext.
 */
import { z } from 'zod';
import type { ToolContext, ToolModule } from '../context.js';
import { MARKER_COLOR_NAMES, MarkerColorSchema, MARKER_COLOR_DESCRIPTION } from '../schemas.js';
import { buildSequenceResolver } from './shared.js';

export const markersTools: ToolModule[] = [
  {
    name: 'add_marker',
    description: 'Adds a marker to the specified sequence for navigation or notes. The sequence does not have to be the active one.',
    inputSchema: z.object({
      sequenceId: z.string().min(1).describe('The sequence ID (GUID) to add the marker to, as returned in the "id" field by list_sequences or get_active_sequence'),
      time: z.number().describe('The time in seconds where the marker should be placed'),
      name: z.string().describe('The name/label for the marker'),
      comment: z.string().optional().describe('Optional comment or description for the marker'),
      color: MarkerColorSchema.optional().describe(MARKER_COLOR_DESCRIPTION),
      duration: z.number().optional().describe('Duration in seconds for a span marker (0 for point marker)')
    }),
    run: (ctx, args) => addMarker(ctx, args.sequenceId, args.time, args.name, args.comment, args.color, args.duration),
  },
  {
    name: 'delete_marker',
    description: 'Deletes a marker from the specified sequence. The sequence does not have to be the active one.',
    inputSchema: z.object({
      sequenceId: z.string().min(1).describe('The sequence ID (GUID) as returned in the "id" field by list_sequences or get_active_sequence'),
      markerId: z.string().min(1).describe('The ID of the marker to delete')
    }),
    run: (ctx, args) => deleteMarker(ctx, args.sequenceId, args.markerId),
  },
  {
    name: 'update_marker',
    description: 'Updates an existing marker\'s properties in the specified sequence. The sequence does not have to be the active one.',
    inputSchema: z.object({
      sequenceId: z.string().min(1).describe('The sequence ID (GUID) as returned in the "id" field by list_sequences or get_active_sequence'),
      markerId: z.string().min(1).describe('The ID of the marker to update'),
      name: z.string().optional().describe('New name for the marker'),
      comment: z.string().optional().describe('New comment'),
      color: MarkerColorSchema.optional().describe(`New colour. ${MARKER_COLOR_DESCRIPTION}`)
    }),
    run: (ctx, args) => updateMarker(ctx, args.sequenceId, args.markerId, args),
  },
  {
    name: 'list_markers',
    description: 'Lists all markers in the specified sequence. The sequence does not have to be the active one.',
    inputSchema: z.object({
      sequenceId: z.string().min(1).describe('The sequence ID (GUID) as returned in the "id" field by list_sequences or get_active_sequence')
    }),
    run: (ctx, args) => listMarkers(ctx, args.sequenceId),
  },
];

function resolveMarkerColor(color?: string | number): number | null {
  if (color === undefined || color === null || color === '') return null;
  if (typeof color === 'number') return color;
  const value = String(color).trim().toLowerCase();
  if (/^[0-7]$/.test(value)) return Number(value);
  const index = MARKER_COLOR_NAMES.indexOf(value as typeof MARKER_COLOR_NAMES[number]);
  return index === -1 ? null : index;
}

async function addMarker(ctx: ToolContext, sequenceId: string, time: number, name: string, comment?: string, color?: string, duration?: number): Promise<any> {
  const colorIndex = resolveMarkerColor(color);
  const script = `
      try {
${buildSequenceResolver(sequenceId)}
        var marker = sequence.markers.createMarker(${time});
        marker.name = ${JSON.stringify(name)};
        ${comment ? `marker.comments = ${JSON.stringify(comment)};` : ''}
        ${colorIndex !== null ? `marker.setColorByIndex(${colorIndex});` : ''}
        ${duration && duration > 0 ? `marker.end = ${time + duration};` : ''}

        return JSON.stringify({
          success: true,
          markerId: marker.guid,
          sequenceId: sequence.sequenceID,
          sequenceName: sequence.name,
          message: "Marker added successfully"
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function deleteMarker(ctx: ToolContext, sequenceId: string, markerId: string): Promise<any> {
  const script = `
      try {
${buildSequenceResolver(sequenceId)}
        var deleted = false;
        for (var i = 0; i < sequence.markers.numMarkers; i++) {
          var marker = sequence.markers[i];
          if (marker.guid === ${JSON.stringify(markerId)}) {
            sequence.markers.deleteMarker(marker);
            deleted = true;
            break;
          }
        }
        var stillPresent = false;
        for (var j = 0; j < sequence.markers.numMarkers; j++) {
          if (sequence.markers[j].guid === ${JSON.stringify(markerId)}) {
            stillPresent = true;
            break;
          }
        }

        return JSON.stringify({
          success: deleted && !stillPresent,
          sequenceId: sequence.sequenceID,
          sequenceName: sequence.name,
          message: deleted && !stillPresent ? "Marker deleted successfully" : (deleted ? "Premiere reported marker deletion but marker is still present" : "Marker not found")
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function updateMarker(ctx: ToolContext, sequenceId: string, markerId: string, updates: any): Promise<any> {
  const updateColorIndex = resolveMarkerColor(updates.color);
  const script = `
      try {
${buildSequenceResolver(sequenceId)}
        var found = false;
        for (var i = 0; i < sequence.markers.numMarkers; i++) {
          var marker = sequence.markers[i];
          if (marker.guid === ${JSON.stringify(markerId)}) {
            ${updates.name !== undefined ? `marker.name = ${JSON.stringify(updates.name)};` : ''}
            ${updates.comment !== undefined ? `marker.comments = ${JSON.stringify(updates.comment)};` : ''}
            ${updateColorIndex !== null ? `marker.setColorByIndex(${updateColorIndex});` : ''}
            found = true;
            break;
          }
        }

        return JSON.stringify({
          success: found,
          sequenceId: sequence.sequenceID,
          sequenceName: sequence.name,
          message: found ? "Marker updated successfully" : "Marker not found"
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function listMarkers(ctx: ToolContext, sequenceId: string): Promise<any> {
  const script = `
      try {
${buildSequenceResolver(sequenceId)}
        // getColorByIndex() is not bounded by the write domain: a marker can hold
        // -1, a persistent "no colour assigned" state that renders black. Guard
        // the lookup, or an undefined value silently drops colorName from the JSON.
        var COLOR_NAMES = ["green","red","purple","orange","yellow","white","blue","cyan"];
        var markers = [];
        for (var i = 0; i < sequence.markers.numMarkers; i++) {
          var marker = sequence.markers[i];
          var colorIndex = marker.getColorByIndex();
          markers.push({
            id: marker.guid,
            name: marker.name,
            comment: marker.comments,
            start: marker.start.seconds,
            end: marker.end.seconds,
            duration: marker.end.seconds - marker.start.seconds,
            type: marker.type,
            color: colorIndex,
            colorName: (colorIndex >= 0 && colorIndex < COLOR_NAMES.length) ? COLOR_NAMES[colorIndex] : null
          });
        }

        return JSON.stringify({
          success: true,
          sequenceId: sequence.sequenceID,
          sequenceName: sequence.name,
          markers: markers,
          count: markers.length
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

/**
 * Every Premiere editing tool, grouped by what it operates on.
 *
 * Catalog order is presentation only: search_tools ranks by BM25 score and
 * breaks ties on name, so regrouping these arrays cannot change a search result.
 */
import type { ToolModule } from '../context.js';

import { audioTools } from './audio.js';
import { discoveryTools } from './discovery.js';
import { effectsTools } from './effects.js';
import { exportTools } from './export.js';
import { graphicsTools } from './graphics.js';
import { markersTools } from './markers.js';
import { mediaTools } from './media.js';
import { projectTools } from './project.js';
import { sequenceTools } from './sequence.js';
import { timelineTools } from './timeline.js';
import { tracksTools } from './tracks.js';
import { workflowsTools } from './workflows.js';

export const domainTools: ToolModule[] = [
  ...audioTools,
  ...discoveryTools,
  ...effectsTools,
  ...exportTools,
  ...graphicsTools,
  ...markersTools,
  ...mediaTools,
  ...projectTools,
  ...sequenceTools,
  ...timelineTools,
  ...tracksTools,
  ...workflowsTools,
];

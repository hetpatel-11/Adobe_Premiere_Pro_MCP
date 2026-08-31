/**
 * Text MCP clients attach at initialize-time (`Server` `instructions`) and
 * via `premiere://config/get_instructions`. Keep this short: hosts that
 * inject it do so on every session, and this is the one place that can
 * stop an agent from spraying editing tools at a closed Premiere.
 */
export const MCP_SERVER_INSTRUCTIONS = [
  'You are driving Adobe Premiere Pro through this MCP server.',
  '',
  'Connection — do this first, once per session:',
  '- Call verify_premiere_connection before any editing tool. If Premiere is installed and not running, that call launches it and waits for the MCP Bridge panel. The CEP panel auto-starts the bridge when Premiere opens it; the user should not have to click Start Bridge.',
  '- If verify_premiere_connection or any other tool returns retry:false with userActionRequired:true, tell the user the nextStep verbatim and STOP. Do not call other editing tools. Do not retry the failed tool.',
  '- A missing MCP Bridge is not a Premiere editing failure. Do not call list_sequences, import_media, apply_effect, or similar until verify_premiere_connection succeeds.',
  '',
  'Editing:',
  '- Inspect before mutating. Prefer list_sequences, list_sequence_tracks, list_project_items, or the premiere://project/* resources unless the user already gave exact IDs.',
  '- Report real Premiere limitations instead of claiming success. Do not invent file paths, clip ids, or .mogrt/.sqpreset files.',
  '- replace_clip with preserveEffects (default true) restores trim, enabled, and Motion, and re-applies other effects. move_clip_to_track restores source in/out and refuses an occupied destination unless overwrite is true.',
].join('\n');

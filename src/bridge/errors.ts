export function isBridgeUnavailableMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('mcp bridge is not running') ||
    normalized.includes('start bridge') ||
    normalized.includes('bridge response timeout')
  );
}

export function bridgeUnavailableResult(tool: string, message: string): {
  success: false;
  error: string;
  tool: string;
  retry: false;
  status: 'bridge_unavailable';
  userActionRequired: true;
  agentAction: 'verify_premiere_connection';
  nextStep: string;
} {
  return {
    success: false,
    error: message,
    tool,
    retry: false,
    status: 'bridge_unavailable',
    userActionRequired: true,
    agentAction: 'verify_premiere_connection',
    nextStep:
      'Call verify_premiere_connection once. It launches Premiere when installed and waits for the MCP Bridge panel, which auto-starts. If that still fails, tell the user the nextStep from that result and stop. Do not retry other editing tools.',
  };
}

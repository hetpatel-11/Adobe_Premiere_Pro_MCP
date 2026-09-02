# Telemetry ingest

Cloudflare Worker + D1 store for anonymous MCP usage events. The published MCP server posts to:

`https://adobe-premiere-mcp-telemetry.hetkp8044.workers.dev/v1/event`

`server_started` and every failed `tool_called` are stored. Successful tool
calls are stored at most once per install/tool/UTC day so we can see that the
product works and which tools are used without burning the Workers Free D1 write
cap on repeat successes.

Payloads are allowlisted. Tool arguments, results, and filesystem paths are dropped.
Failed tool calls include a short `error_code`, Zod `error_fields`, `retry`, `status`,
and a path-stripped `error_detail` template.

## Deploy

```bash
cd telemetry
npx wrangler types
npx wrangler d1 migrations apply premiere-mcp-telemetry --remote
npx wrangler deploy
```

## Useful queries

```bash
npx wrangler d1 execute premiere-mcp-telemetry --remote --command="SELECT COUNT(DISTINCT distinct_id) AS installs FROM events WHERE received_at >= datetime('now', '-7 days')"

npx wrangler d1 execute premiere-mcp-telemetry --remote --command="SELECT date(received_at) AS day, COUNT(DISTINCT distinct_id) AS installs, COUNT(*) AS events FROM events GROUP BY 1 ORDER BY 1 DESC LIMIT 30"

npx wrangler d1 execute premiere-mcp-telemetry --remote --command="SELECT tool, COUNT(DISTINCT distinct_id) AS installs FROM events WHERE event = 'tool_called' AND success = 1 AND received_at >= datetime('now', '-7 days') GROUP BY tool ORDER BY installs DESC"

npx wrangler d1 execute premiere-mcp-telemetry --remote --command="SELECT tool, SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failures FROM events WHERE event = 'tool_called' AND received_at >= datetime('now', '-7 days') GROUP BY tool ORDER BY failures DESC"

npx wrangler d1 execute premiere-mcp-telemetry --remote --command="SELECT tool, error_kind, error_code, error_fields, error_detail, COUNT(*) AS n, COUNT(DISTINCT distinct_id) AS installs FROM events WHERE event = 'tool_called' AND success = 0 GROUP BY 1, 2, 3, 4, 5 ORDER BY n DESC LIMIT 40"
```

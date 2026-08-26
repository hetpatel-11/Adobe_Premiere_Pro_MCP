# Telemetry ingest

Cloudflare Worker + D1 store for anonymous MCP usage events. The published MCP server posts to:

`https://adobe-premiere-mcp-telemetry.hetkp8044.workers.dev/v1/event`

Payloads are allowlisted. Tool arguments, results, paths, and error text are dropped.

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

npx wrangler d1 execute premiere-mcp-telemetry --remote --command="SELECT tool, COUNT(*) AS calls, SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failures, ROUND(AVG(duration_ms), 1) AS avg_ms FROM events WHERE event = 'tool_called' GROUP BY tool ORDER BY calls DESC"
```

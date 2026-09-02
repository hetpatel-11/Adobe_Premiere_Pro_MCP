# premiere-mcp.com

Marketing and install site for this repo. Deployed as the `premiere-mcp-web` Cloudflare Worker.

```bash
npm install
npm test
npm run dev
npm run deploy
```

The Worker in `worker/` serves markdown (`Accept: text/markdown`), `/openapi.json`, JSON `/api` errors, MCP manifests, and agent 404s. The React UI still hydrates the homepage and `/docs/`.

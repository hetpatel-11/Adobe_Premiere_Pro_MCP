# Contributing

This project manipulates a live Premiere Pro session. Treat tool contracts and documentation as part of the product, not cleanup work.

## Local Setup

```bash
npm install
npm run build
```

For a full local install on macOS:

```bash
npm run setup:mac
```

That installs the CEP extension, builds the server, enables CEP debug mode, and updates Claude Desktop config.

## Core Development Loop

Use this order:

1. Change TypeScript or CEP code.
2. Rebuild with `npm run build`.
3. If you changed `cep-plugin/bridge-cep.js`, reload the panel in Premiere Pro.
4. Run tests with `npm test -- --runInBand`.
5. Run a live sweep against a scratch project with `node scripts/live-tool-sweep.mjs`.
6. Update docs if behavior or setup changed.

Do not ship a new tool that has only been schema-validated if it claims to perform a real edit.

## Project Layout

```text
src/
  index.ts                MCP server entry point
  bridge/index.ts         File-based bridge and shared helpers
  tools/index.ts          Tool catalog and implementations
  resources/index.ts      MCP resources
  prompts/index.ts        MCP prompts
  utils/                  Shared helpers

cep-plugin/
  bridge-cep.js           CEP bridge runtime loaded by Premiere
  index.html              CEP panel UI
  CSXS/manifest.xml       CEP manifest

scripts/
  install-macos.sh        macOS installer
  doctor-macos.sh         local installation verifier
  uninstall-macos.sh      macOS uninstall helper
  live-tool-sweep.mjs     end-to-end live tool verifier
```

## Tool Design Rules

### 1. Do not advertise fake capabilities

If Premiere cannot do something reliably through the available APIs, either:

- do not expose the tool, or
- expose it with a truthful limitation and a narrow scope

Do not return fake success.

### 2. Validate inputs at the schema layer

Every tool must have a Zod schema that rejects incomplete or invalid arguments before the bridge is touched.

### 3. Keep ExtendScript compatible

Use ExtendScript-safe JavaScript inside generated scripts:

- `var`, not `let` or `const`
- no arrow functions
- no modern syntax that ExtendScript does not support

### 4. Prefer truthful errors over silent fallback

If a Premiere API is missing or unsupported, return an explicit error that explains the dependency or limitation.

## Testing Expectations

Minimum bar before merging:

- `npm run build`
- `npm test -- --runInBand`

Release bar:

- `npm run setup:doctor`
- `node scripts/live-tool-sweep.mjs`

The live sweep is intentionally mutating. Use a disposable project because it creates `Sweep ...` sequences and imports generated assets.

## Editing the CEP Bridge

The CEP code is loaded directly by Premiere and has no build step.

If you change [bridge-cep.js](/Users/hetpatel/Desktop/Adobe_Premiere_Pro_MCP/Adobe_Premiere_Pro_MCP/Adobe_Premiere_Pro_MCP/cep-plugin/bridge-cep.js):

1. Re-run `npm run setup:mac`, or manually copy the updated file into the installed extension.
2. Right-click the Premiere panel and choose `Reload`, or restart Premiere Pro.

If you forget that reload, you are testing stale JavaScript in memory.

## Documentation Rules

When behavior changes:

- update `README.md` if install, capability, or validation status changed
- update `QUICKSTART.md` if the shortest working path changed
- update `KNOWN_ISSUES.md` if a limitation was fixed or newly confirmed

Stale docs are considered a bug.

## Pull Requests

A good PR includes:

- what changed
- why it changed
- how it was tested
- whether the tool surface changed
- whether docs were updated

If you add, remove, or materially change a tool, mention it explicitly in the PR summary.

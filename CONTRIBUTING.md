# Contributing to Adobe Premiere Pro MCP

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

1. **Fork and clone the repository**
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Build the project:**
   ```bash
   npm run build
   ```
4. **Install the CEP plugin locally** (see QUICKSTART.md)

## Project Structure

```
src/
├── index.ts              # MCP server entry point
├── bridge/
│   └── index.ts          # Communication bridge logic
├── tools/
│   └── index.ts          # MCP tool definitions
├── resources/
│   └── index.ts          # MCP resource definitions
├── prompts/
│   └── index.ts          # MCP prompt definitions
└── utils/
    ├── logger.ts         # Logging utilities
    └── security.ts       # Security validation

cep-plugin/
├── index.html            # CEP panel UI
├── bridge-cep.js         # CEP bridge logic (vanilla JS)
├── CSInterface.js        # Adobe CEP library
└── CSXS/manifest.xml     # CEP extension manifest
```

## Making Changes

### Adding New MCP Tools

1. **Define the tool in `src/tools/index.ts`:**
   ```typescript
   {
     name: 'my_new_tool',
     description: 'What this tool does',
     inputSchema: z.object({
       param1: z.string().describe('Parameter description'),
     }),
   }
   ```

2. **Implement the handler:**
   ```typescript
   case 'my_new_tool':
     return await this.bridge.executeScript(`
       // ExtendScript code here
       var result = app.doSomething();
       JSON.stringify(result);
     `);
   ```

3. **Remember ExtendScript limitations:**
   - Use `var` not `const`/`let`
   - No arrow functions
   - No modern array methods
   - Manual date formatting (no `toISOString()`)

### Modifying the CEP Plugin

The CEP plugin uses **vanilla JavaScript** (no build step):

1. **Edit `cep-plugin/bridge-cep.js`**
2. **Copy to installed location:**
   ```bash
   cp cep-plugin/bridge-cep.js ~/Library/Application\ Support/Adobe/CEP/extensions/MCPBridgeCEP/
   ```
3. **Reload in Premiere Pro:**
   - Right-click in panel → Reload
   - Or restart Premiere Pro

### Testing Changes

1. **Build the MCP server:**
   ```bash
   npm run build
   ```

2. **Restart Claude Desktop** (Cmd+Q, then reopen)

3. **Test in Premiere Pro:**
   - Make sure bridge is started
   - Ask Claude to use your new tool
   - Check Activity Log for errors

4. **Run unit tests:**
   ```bash
   npm test
   ```

## Code Style

- **TypeScript:** Follow existing patterns in `src/`
- **JavaScript (CEP):** Use ES5 compatible code
- **Formatting:** Run `npm run format` before committing
- **Linting:** Run `npm run lint` to check for issues

## ExtendScript Guidelines

When writing ExtendScript code:

### ✅ DO:
```javascript
var items = [];
for (var i = 0; i < array.length; i++) {
  items.push(array[i]);
}
```

### ❌ DON'T:
```javascript
const items = array.map(item => item.name); // Arrow functions don't work
```

### Date Formatting:
```javascript
// ✅ DO:
var d = new Date();
var timestamp = d.getFullYear() + "-" + 
  String(d.getMonth() + 1).replace(/^(\d)$/, "0$1") + "-" + 
  String(d.getDate()).replace(/^(\d)$/, "0$1");

// ❌ DON'T:
var timestamp = new Date().toISOString(); // Doesn't exist
```

## Commit Guidelines

- Use clear, descriptive commit messages
- Reference issues: `Fix #123: Description`
- Keep commits focused (one feature/fix per commit)

Example:
```
Add timeline position tool

- Implement get_playhead_position tool
- Add set_playhead_position tool
- Update README with new tools
```

## Pull Request Process

1. **Create a feature branch:**
   ```bash
   git checkout -b feature/my-new-feature
   ```

2. **Make your changes and commit**

3. **Test thoroughly:**
   - Build succeeds
   - Tests pass
   - Works in Premiere Pro
   - No console errors

4. **Push and create PR:**
   ```bash
   git push origin feature/my-new-feature
   ```

5. **In your PR description:**
   - What does this change do?
   - Why is it needed?
   - How did you test it?
   - Any breaking changes?

## Testing Checklist

Before submitting a PR:

- [ ] Code builds without errors (`npm run build`)
- [ ] Tests pass (`npm test`)
- [ ] Linting passes (`npm run lint`)
- [ ] CEP plugin loads in Premiere Pro
- [ ] Bridge connects successfully
- [ ] New tools work as expected
- [ ] No console errors
- [ ] Documentation updated (README.md)

## Security Considerations

When adding new tools:

1. **Validate all inputs** using Zod schemas
2. **Sanitize file paths** using `validateFilePath()`
3. **Check for dangerous patterns** in scripts
4. **Limit script size** (current: 500KB)
5. **Never use `eval()` or `Function()`**

Example:
```typescript
inputSchema: z.object({
  filePath: z.string().describe('File path'),
}),

// In handler:
const validation = validateFilePath(args.filePath);
if (!validation.valid) {
  throw new Error(`Invalid path: ${validation.error}`);
}
```

## Common Issues

### "Module not found" errors
```bash
rm -rf node_modules package-lock.json
npm install
```

### CEP plugin changes not reflected
```bash
# Copy updated file
cp cep-plugin/bridge-cep.js ~/Library/Application\ Support/Adobe/CEP/extensions/MCPBridgeCEP/

# Reload in Premiere Pro
# Right-click panel → Reload
```

### Claude doesn't see changes
```bash
# Rebuild
npm run build

# Restart Claude Desktop (Cmd+Q, then reopen)
```

## Need Help?

- Check existing issues: [GitHub Issues](https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP/issues)
- Ask questions in discussions
- Read the README.md for architecture details

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

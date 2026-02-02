# Known Issues and Fixes

## Current Status (as of February 2026)

### ✅ Working Tools (Verified)
- `get_project_info` - Retrieves project information
- `list_project_items` - Lists all items in project
- `get_sequence_settings` - Gets sequence settings

### ❌ Broken Tools (Need Fixes)

#### 1. `list_sequences` - TypeError: undefined is not an object
**Issue:** Missing `return` statement in ExtendScript
**Location:** `src/tools/index.ts:945`
**Fix:**
```typescript
// BEFORE (line 945):
JSON.stringify({

// AFTER:
return JSON.stringify({
```

#### 2. `create_bin` - ReferenceError: parentBinName is undefined
**Issue:** Variable `parentBinName` used in ExtendScript but not defined
**Location:** `src/tools/index.ts:1238`
**Fix:**
```typescript
// BEFORE (line 1238):
parentBin: parentBinName || "Root"

// AFTER:
parentBin: ${parentBinName ? `"${parentBinName}"` : '"Root"'}
```

#### 3. `list_sequence_tracks` - ExtendScript execution failed
**Issue:** Similar to list_sequences, missing return statement
**Location:** `src/tools/index.ts:966-970`
**Fix:**
```typescript
// Add 'return' before JSON.stringify in the script
```

#### 4. `import_media` - Script validation failed
**Issue:** Path validation is too strict or file path format issue
**Location:** `src/bridge/index.ts:237-243`
**Potential Fix:**
```typescript
// Check validateFilePath and sanitizeInput functions
// They might be rejecting valid paths
```

## Quick Fix Guide

### For Developers

**1. Fix all ExtendScript return statements:**
```bash
# Navigate to project
cd /Users/YOUR_USERNAME/Desktop/Adobe_Premiere_Pro_MCP/Adobe_Premiere_Pro_MCP

# Edit src/tools/index.ts
# Add 'return' before ALL JSON.stringify() calls in ExtendScript code blocks
```

**2. Fix createBin template literal:**
```typescript
// In createBin method, ensure variables are properly escaped
// Use template literal interpolation correctly
```

**3. Test after fixes:**
```bash
npm run build
# Restart Claude Desktop
# Test each tool
```

### For Users (Workarounds)

Until these are fixed:

**Instead of `create_bin`:**
- Manually create bins in Premiere Pro
- Then use `list_project_items` to see them

**Instead of `list_sequences`:**
- Use `get_sequence_settings` with a known sequence ID
- Manually check sequences in Premiere Pro

**Instead of `import_media`:**
- Manually drag files into Premiere Pro
- Use File > Import in Premiere Pro
- Then use `list_project_items` to see imported media

**Instead of `list_sequence_tracks`:**
- Use `get_sequence_settings` for basic info
- Manually check tracks in Premiere Pro

## Root Cause Analysis

### Common Pattern: Missing `return` in ExtendScript

Many tools have this pattern:
```javascript
// WRONG:
JSON.stringify({ success: true });

// CORRECT:
return JSON.stringify({ success: true });
```

**Why it fails:**
ExtendScript returns `undefined` if there's no explicit `return`, causing "undefined is not an object" errors.

### Template Literal Variable Scope

Variables in template literals are evaluated in Node.js scope, not ExtendScript scope:

```javascript
// WRONG:
parentBin: parentBinName || "Root"  // parentBinName not defined in ExtendScript

// CORRECT:
parentBin: ${parentBinName ? `"${parentBinName}"` : '"Root"'}
```

## Fixing All Tools

To fix all broken tools systematically:

1. **Search for all ExtendScript blocks:**
   ```bash
   grep -n "const script = \`" src/tools/index.ts src/bridge/index.ts
   ```

2. **For each block, verify:**
   - [ ] All `JSON.stringify()` calls have `return`
   - [ ] All template literal variables are properly interpolated
   - [ ] No use of undefined variables in ExtendScript scope

3. **Test each tool:**
   ```typescript
   // Ask Claude:
   "Test the [tool_name] tool"
   ```

## Progress Tracker

- [ ] Fix `list_sequences` (return statement)
- [ ] Fix `create_bin` (variable scope)
- [ ] Fix `list_sequence_tracks` (return statement)
- [ ] Fix `import_media` (path validation)
- [ ] Fix `import_folder` (return statement)
- [ ] Audit all other tools for same issues
- [ ] Add unit tests for ExtendScript generation
- [ ] Document all working vs broken tools

## Contributing

If you fix any of these issues:

1. Test thoroughly in Premiere Pro
2. Update this file to mark as fixed
3. Add test case if possible
4. Submit PR with clear description

## See Also

- `CONTRIBUTING.md` - Developer guide
- `README.md` - Main documentation
- `src/tools/index.ts` - Tool implementations
- `src/bridge/index.ts` - Bridge ExtendScript code

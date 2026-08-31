#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const serverEntry = join(packageRoot, 'dist', 'index.js');

function printHelp(): void {
  console.log(`Premiere Pro MCP

Usage:
  premiere-pro-mcp                 Start the MCP stdio server
  premiere-pro-mcp --install-cep   Install the CEP bridge and configure supported MCP clients
  premiere-pro-mcp --doctor        Check the local server, CEP bridge, and client configuration
  premiere-pro-mcp --version       Print the installed package version
  premiere-pro-mcp --help          Show this help

Telemetry is on by default. Set PREMIERE_MCP_TELEMETRY=0 to opt out.
Update checks are on by default. Set PREMIERE_MCP_UPDATE_CHECK=0 to opt out.
Tool search is on by default (search_tools + invoke_tool). Set PREMIERE_MCP_TOOLSET=full to advertise every Premiere tool to the MCP host.
`);
}

function run(command: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

async function runPlatformScript(macScript: string, windowsScript: string, windowsArgs: string[] = []): Promise<void> {
  let code: number;
  if (process.platform === 'darwin') {
    code = await run('bash', [join(packageRoot, 'scripts', macScript), '--skip-build']);
  } else if (process.platform === 'win32') {
    code = await run('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      join(packageRoot, 'scripts', windowsScript),
      ...windowsArgs,
    ]);
  } else {
    throw new Error('Premiere Pro MCP setup is supported on macOS and Windows only.');
  }

  if (code !== 0) process.exitCode = code;
}

async function main(): Promise<void> {
  const [command] = process.argv.slice(2);

  switch (command) {
    case undefined:
    case 'serve':
      process.exitCode = await run(process.execPath, [serverEntry]);
      return;
    case '--install-cep':
    case 'install-cep':
    case 'setup':
      await runPlatformScript('install-macos.sh', 'install-windows.ps1', ['-SkipBuild']);
      return;
    case '--doctor':
    case 'doctor':
      await runPlatformScript('doctor-macos.sh', 'doctor-windows.ps1');
      return;
    case '--version':
    case '-v': {
      const packageJson = await import('../package.json', { with: { type: 'json' } });
      console.log(packageJson.default.version);
      return;
    }
    case '--help':
    case '-h':
    case 'help':
      printHelp();
      return;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

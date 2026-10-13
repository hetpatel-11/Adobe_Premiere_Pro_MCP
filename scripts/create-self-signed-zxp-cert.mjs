import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const zxpSignCommand = process.env.ZXP_SIGN_CMD;
if (!zxpSignCommand) throw new Error('Set ZXP_SIGN_CMD to the Adobe ZXPSignCmd executable.');

const isWindows = platform() === 'win32';
const isMac = platform() === 'darwin';

const defaultCertDir = isWindows
  ? join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Adobe_Premiere_Pro_MCP', 'signing')
  : join(homedir(), 'Library', 'Application Support', 'Adobe_Premiere_Pro_MCP', 'signing');

const certificatePath = process.env.ZXP_CERT_PATH || join(defaultCertDir, 'premiere-mcp-self-signed.p12');
const password = randomBytes(32).toString('base64url');

await mkdir(dirname(certificatePath), { recursive: true });
execFileSync(zxpSignCommand, [
  '-selfSignedCert', 'US', 'CA', 'Het Patel', 'Adobe Premiere Pro MCP', password, certificatePath,
  '-validityDays', '3650'
], { stdio: 'inherit' });
await chmod(certificatePath, 0o600).catch(() => {});

if (isMac) {
  const service = 'adobe-premiere-pro-mcp-zxp-signing';
  const account = 'certificate-password';
  execFileSync('security', ['add-generic-password', '-U', '-a', account, '-s', service, '-w', password], { stdio: 'ignore' });
  console.log(`Self-signed certificate stored at ${certificatePath}`);
  console.log(`Password stored in the macOS Keychain service ${service}.`);
} else {
  // No cross-platform equivalent of Keychain here. Store the password next to the
  // certificate in a file only the current user can read, and never commit it.
  const passwordPath = join(dirname(certificatePath), 'cert-password.txt');
  await writeFile(passwordPath, password, 'utf8');
  await chmod(passwordPath, 0o600).catch(() => {});
  console.log(`Self-signed certificate stored at ${certificatePath}`);
  console.log(`Password stored at ${passwordPath}. Keep this file private; do not commit it.`);
}

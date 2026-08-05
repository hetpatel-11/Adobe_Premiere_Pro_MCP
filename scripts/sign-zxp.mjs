import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const zxpSignCommand = process.env.ZXP_SIGN_CMD;
const certificatePath = process.env.ZXP_CERT_PATH;
const certificatePassword = process.env.ZXP_CERT_PASSWORD;
const outputPath = process.env.ZXP_OUTPUT_PATH || join(root, 'release-artifacts', `MCPBridgeCEP-v${packageJson.version}-self-signed.zxp`);

if (!zxpSignCommand || !existsSync(zxpSignCommand)) {
  throw new Error('Set ZXP_SIGN_CMD to the Adobe ZXPSignCmd executable.');
}
if (!certificatePath || !existsSync(certificatePath)) {
  throw new Error('Set ZXP_CERT_PATH to a private PKCS#12 (.p12) certificate.');
}
if (!certificatePassword) {
  throw new Error('Set ZXP_CERT_PASSWORD. Do not commit certificate passwords or certificate files.');
}

await mkdir(dirname(outputPath), { recursive: true });
execFileSync(zxpSignCommand, [
  '-sign',
  join(root, 'cep-plugin'),
  outputPath,
  certificatePath,
  certificatePassword,
], { stdio: 'inherit' });
await chmod(outputPath, 0o644);
execFileSync(zxpSignCommand, ['-verify', outputPath], { stdio: 'inherit' });
console.log(`Signed ZXP created: ${outputPath}`);

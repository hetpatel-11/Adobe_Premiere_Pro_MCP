import { promises as fs } from 'fs';
import { join } from 'path';
import { deflateSync } from 'zlib';

export interface DemoAsset {
  name: string;
  path: string;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function makeCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
}

const crcTable = makeCrcTable();

function crc32(buffers: Uint8Array[]): number {
  let c = 0xffffffff;
  for (const buffer of buffers) {
    for (let i = 0; i < buffer.length; i++) {
      const byte = buffer[i] ?? 0;
      c = (crcTable[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32([typeBuffer, data]), 0);
  return Buffer.concat([len, typeBuffer, data, crc]);
}

function encodePng(width: number, height: number, pixelAt: (x: number, y: number) => [number, number, number]): Buffer {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * stride;
    raw[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelAt(x, y);
      const offset = rowOffset + 1 + x * 3;
      raw[offset] = clamp(r);
      raw[offset + 1] = clamp(g);
      raw[offset + 2] = clamp(b);
    }
  }

  const header = Buffer.from([
    0x89, 0x50, 0x4e, 0x47,
    0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;

  return Buffer.concat([
    header,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function sceneFocus(width: number, height: number) {
  return (x: number, y: number): [number, number, number] => {
    const nx = (x / (width - 1)) * 2 - 1;
    const ny = (y / (height - 1)) * 2 - 1;
    const radial = Math.sqrt(nx * nx + ny * ny);
    let value = mix(8, 28, 1 - Math.min(1, radial * 0.95));
    value += smoothstep(0.18, 0.42, 1 - radial) * 16;
    if (Math.abs(y - height * 0.34) < 2 && x > width * 0.32 && x < width * 0.68) {
      value += 70 * (1 - Math.abs((x - width / 2) / (width * 0.18)));
    }
    return [value, value, value + 2];
  };
}

function scenePrecision(width: number, height: number) {
  return (x: number, y: number): [number, number, number] => {
    const t = x / (width - 1);
    let base = mix(10, 22, t * 0.6 + (y / (height - 1)) * 0.4);
    const left = width * 0.36;
    const right = width * 0.64;
    const top = height * 0.24;
    const bottom = height * 0.76;
    const inside = x > left && x < right && y > top && y < bottom;
    if (inside) {
      base += 14;
      const border = Math.min(
        Math.abs(x - left),
        Math.abs(x - right),
        Math.abs(y - top),
        Math.abs(y - bottom),
      );
      if (border < 6) {
        base += 72 - border * 10;
      }
    }
    return [base, base, base + 3];
  };
}

function sceneFinish(width: number, height: number) {
  return (x: number, y: number): [number, number, number] => {
    const nx = (x - width / 2) / (width * 0.5);
    const ny = (y - height / 2) / (height * 0.28);
    const ellipse = nx * nx + ny * ny;
    let base = mix(4, 18, 1 - Math.min(1, Math.abs((x - width / 2) / (width * 0.5))));
    if (ellipse < 1) {
      base += (1 - ellipse) * 48;
    }
    if (Math.abs(y - height * 0.52) < 2 && x > width * 0.24 && x < width * 0.76) {
      base += 22;
    }
    return [base, base, base + 4];
  };
}

export async function createMotionDemoAssets(assetDir: string, width = 1920, height = 1080): Promise<DemoAsset[]> {
  await fs.mkdir(assetDir, { recursive: true });

  const assets: Array<{ name: string; pixelAt: (x: number, y: number) => [number, number, number] }> = [
    { name: '01_focus.png', pixelAt: sceneFocus(width, height) },
    { name: '02_precision.png', pixelAt: scenePrecision(width, height) },
    { name: '03_finish.png', pixelAt: sceneFinish(width, height) },
  ];

  await Promise.all(
    assets.map(async ({ name, pixelAt }) => {
      const png = encodePng(width, height, pixelAt);
      await fs.writeFile(join(assetDir, name), png);
    }),
  );

  return assets.map(({ name }) => ({
    name,
    path: join(assetDir, name),
  }));
}

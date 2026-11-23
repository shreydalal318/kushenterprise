import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Db } from '@kush/db';
import { env } from '../env';

export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf' };

interface Driver {
  put(key: string, body: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer>;
}

const localDriver = (): Driver => {
  const root = resolve(env.storageLocalDir);
  const safe = (key: string) => {
    const p = resolve(join(root, key));
    if (!p.startsWith(root)) throw new Error('Invalid storage key');
    return p;
  };
  return {
    async put(key, body) {
      const p = safe(key);
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, body);
    },
    get: (key) => readFile(safe(key)),
  };
};

// S3-compatible (AWS S3, Cloudflare R2, MinIO). Configure via S3_* env vars.
const s3Driver = (): Driver => {
  const client = new S3Client({
    region: env.s3.region,
    endpoint: env.s3.endpoint,
    forcePathStyle: !!env.s3.endpoint,
    credentials: env.s3.accessKeyId ? { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey } : undefined,
  });
  return {
    async put(key, body, mime) {
      await client.send(new PutObjectCommand({ Bucket: env.s3.bucket, Key: key, Body: body, ContentType: mime }));
    },
    async get(key) {
      const r = await client.send(new GetObjectCommand({ Bucket: env.s3.bucket, Key: key }));
      return Buffer.from(await r.Body!.transformToByteArray());
    },
  };
};

let driver: Driver | undefined;
const getDriver = () => (driver ??= env.storageDriver === 's3' ? s3Driver() : localDriver());

/** Store a file and register it as a FileAsset. */
export async function saveFile(db: Db, body: Buffer, mimeType: string, purpose: string) {
  const ext = EXT[mimeType] ?? 'bin';
  const key = `${purpose}/${new Date().toISOString().slice(0, 7)}/${randomBytes(12).toString('hex')}.${ext}`;
  await getDriver().put(key, body, mimeType);
  return db.fileAsset.create({ data: { bucketKey: key, mimeType, sizeBytes: body.length, purpose } });
}

export async function loadFile(db: Db, id: string) {
  const asset = await db.fileAsset.findUnique({ where: { id } });
  if (!asset) return null;
  return { asset, body: await getDriver().get(asset.bucketKey) };
}

/** Sniff the real image type from magic bytes rather than trusting the upload's declared type. */
export function sniffImageType(buf: Buffer): (typeof ALLOWED_IMAGE_TYPES)[number] | null {
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

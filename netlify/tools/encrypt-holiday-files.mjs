// Encrypts the paid Holiday files so they can live in this (public) repo.
// The download function decrypts them at request time with HOLIDAY_FILES_KEY.
//
// Usage (from the repo root), one id=path pair per file you are replacing:
//   HOLIDAY_FILES_KEY="<key from Netlify>" node netlify/tools/encrypt-holiday-files.mjs \
//     pack="<pack.pdf>" muse="<muse.pdf>" pack-epub="<pack.epub>" muse-epub="<muse.epub>"
// Ids and output names come from FILES in netlify/lib/holiday.mjs.
// Format: 12-byte IV | 16-byte GCM tag | ciphertext (AES-256-GCM).
import crypto from 'node:crypto';
import fs from 'node:fs';
import { FILES } from '../lib/holiday.mjs';

const key = Buffer.from(process.env.HOLIDAY_FILES_KEY || '', 'base64');
if (key.length !== 32) { console.error('HOLIDAY_FILES_KEY must be 32 bytes, base64.'); process.exit(1); }
const pairs = process.argv.slice(2).map((a) => a.split(/=(.*)/s).slice(0, 2));
if (!pairs.length) { console.error(`Pass id=path pairs. Ids: ${Object.keys(FILES).join(', ')}`); process.exit(1); }

const MAGIC = { 'application/pdf': '%PDF', 'application/epub+zip': 'PK\u0003\u0004' };
for (const [id, src] of pairs) {
  const spec = FILES[id];
  if (!spec || !src) { console.error(`Unknown id "${id}". Ids: ${Object.keys(FILES).join(', ')}`); process.exit(1); }
  const plain = fs.readFileSync(src);
  if (plain.subarray(0, 4).toString('latin1') !== MAGIC[spec.type]) { console.error(`${src} is not a ${spec.format}`); process.exit(1); }
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  fs.writeFileSync(`netlify/private/holiday/${spec.file}`, Buffer.concat([iv, c.getAuthTag(), body]));
  console.log(`encrypted ${src} -> netlify/private/holiday/${spec.file} (${plain.length} bytes)`);
}

// Encrypts the paid Holiday PDFs so they can live in this (public) repo.
// The download function decrypts them at request time with HOLIDAY_FILES_KEY.
//
// Usage (from the repo root):
//   HOLIDAY_FILES_KEY="$(netlify env:get HOLIDAY_FILES_KEY)" \
//     node netlify/tools/encrypt-holiday-files.mjs "<pack.pdf>" "<muse-setup.pdf>"
// Writes netlify/private/holiday/holiday-prompt-pack.pdf.enc and muse-holiday-setup.pdf.enc.
// Format: 12-byte IV | 16-byte GCM tag | ciphertext (AES-256-GCM).
import crypto from 'node:crypto';
import fs from 'node:fs';

const key = Buffer.from(process.env.HOLIDAY_FILES_KEY || '', 'base64');
if (key.length !== 32) { console.error('HOLIDAY_FILES_KEY must be 32 bytes, base64.'); process.exit(1); }
const [pack, muse] = process.argv.slice(2);
if (!pack || !muse) { console.error('Pass the pack PDF and the Muse setup PDF.'); process.exit(1); }

for (const [src, out] of [[pack, 'holiday-prompt-pack.pdf.enc'], [muse, 'muse-holiday-setup.pdf.enc']]) {
  const plain = fs.readFileSync(src);
  if (plain.subarray(0, 4).toString() !== '%PDF') { console.error(`${src} is not a PDF`); process.exit(1); }
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  fs.writeFileSync(`netlify/private/holiday/${out}`, Buffer.concat([iv, c.getAuthTag(), body]));
  console.log(`encrypted ${src} -> netlify/private/holiday/${out} (${plain.length} bytes)`);
}

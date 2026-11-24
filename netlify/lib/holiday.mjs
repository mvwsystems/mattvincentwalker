// Shared logic for the Holiday Prompt Pack checkout (Stripe + Resend, no SDKs).
// Used by netlify/functions/holiday-*.mjs.
//
// Env (Netlify → Site configuration → Environment variables):
//   STRIPE_SECRET_KEY        sk_test_… while testing, sk_live_… to go live
//   STRIPE_PUBLISHABLE_KEY   pk_test_… / pk_live_… (must match the secret key's mode)
//   STRIPE_WEBHOOK_SECRET    whsec_… from the webhook endpoint (optional but recommended)
//   RESEND_API_KEY           already set for the site's other emails
//   HOLIDAY_FILES_KEY        decrypts the paid PDFs (see netlify/tools/encrypt-holiday-files.mjs)

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SITE = 'https://mattvincentwalker.com';
export const PRODUCT_TAG = 'holiday-prompt-pack';

// Prices live here, on the server, so the browser can never change them.
export const PACK = { id: 'pack', name: 'The Ultimate Holiday Prompt Pack', amount: 2700 };
export const BUMP = { id: 'muse', name: 'Muse Holiday Setup', amount: 4700 };

// Private files: AES-256-GCM encrypted (the repo is public), bundled with the download
// function (netlify.toml included_files), and blocked from public URLs by the /netlify/* rule.
export const FILES = {
  pack: { file: 'holiday-prompt-pack.pdf.enc', download: 'The Ultimate Holiday Prompt Pack.pdf', label: 'The Ultimate Holiday Prompt Pack', sub: '61 prompts · PDF' },
  muse: { file: 'muse-holiday-setup.pdf.enc', download: 'Muse Holiday Setup - The Guided Walkthrough.pdf', label: 'Muse Holiday Setup', sub: 'The guided walkthrough · PDF' },
};

export const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

export const totalFor = (bump) => PACK.amount + (bump ? BUMP.amount : 0);
export const returnPathFor = (bump) => (bump ? '/holiday/thank-you-plus/' : '/holiday/thank-you/');

// ── Stripe REST (form-encoded, no SDK) ──
function encode(obj, prefix) {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item) => out.push(`${encodeURIComponent(key + '[]')}=${encodeURIComponent(item)}`));
    else if (typeof v === 'object') out.push(encode(v, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return out.filter(Boolean).join('&');
}

export async function stripe(method, endpoint, params) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  let url = `https://api.stripe.com/v1/${endpoint}`;
  const init = { method, headers: { Authorization: `Bearer ${key}` } };
  if (params && method === 'GET') url += `?${encode(params)}`;
  else if (params) {
    init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = encode(params);
  }
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Stripe ${res.status}`);
    err.stripe = data?.error;
    throw err;
  }
  return data;
}

export const getIntent = (id) =>
  stripe('GET', `payment_intents/${encodeURIComponent(id)}`, { expand: ['latest_charge'] });

// What a paid intent unlocks.
export function entitlements(pi) {
  if (!pi || pi.metadata?.product !== PRODUCT_TAG) return [];
  return pi.metadata?.bump === '1' ? ['muse', 'pack'] : ['pack'];
}

export const isRefunded = (pi) => Boolean(pi?.latest_charge && typeof pi.latest_charge === 'object' && pi.latest_charge.refunded);

// ── Download links: HMAC token so a link only works for its own order and file ──
function tokenSecret() {
  return process.env.HOLIDAY_DOWNLOAD_SECRET || process.env.STRIPE_SECRET_KEY || '';
}
export function downloadToken(piId, file) {
  return crypto.createHmac('sha256', tokenSecret()).update(`${piId}:${file}`).digest('hex').slice(0, 32);
}
export function verifyDownloadToken(piId, file, token) {
  if (!token || typeof token !== 'string' || token.length !== 32) return false;
  const expected = downloadToken(piId, file);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}
export function downloadLinks(pi, base = SITE) {
  return entitlements(pi).map((f) => ({
    id: f,
    label: FILES[f].label,
    sub: FILES[f].sub,
    url: `${base}/holiday/download?pi=${encodeURIComponent(pi.id)}&f=${f}&t=${downloadToken(pi.id, f)}`,
  }));
}

export function readPrivateFile(name) {
  const rel = path.join('netlify', 'private', 'holiday', name);
  const roots = [process.env.LAMBDA_TASK_ROOT, process.cwd(), '/var/task', path.resolve('.')].filter(Boolean);
  let blob = null;
  for (const root of roots) {
    const p = path.join(root, rel);
    if (fs.existsSync(p)) { blob = fs.readFileSync(p); break; }
  }
  if (!blob) throw new Error(`Private file not found: ${rel} (looked in ${roots.join(', ')})`);

  const key = Buffer.from(process.env.HOLIDAY_FILES_KEY || '', 'base64');
  if (key.length !== 32) throw new Error('HOLIDAY_FILES_KEY is missing or not 32 bytes');
  const d = crypto.createDecipheriv('aes-256-gcm', key, blob.subarray(0, 12));
  d.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([d.update(blob.subarray(28)), d.final()]);
}

// ── Stripe webhook signature (v1, HMAC-SHA256 over "t.body") ──
export function verifyStripeSignature(rawBody, header, secret, toleranceSec = 300) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(',').map((kv) => kv.split('=')).filter((p) => p.length === 2).map(([k, v]) => [k.trim(), v.trim()])
  );
  const sigs = header.split(',').filter((s) => s.trim().startsWith('v1=')).map((s) => s.trim().slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

// ── Receipt email (Resend). Idempotent: Resend key + a metadata flag on the intent. ──
const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function receiptEmail(pi) {
  const bump = pi.metadata?.bump === '1';
  const first = (pi.metadata?.name || '').trim().split(/\s+/)[0];
  const links = downloadLinks(pi);
  const total = `$${(pi.amount / 100).toFixed(2).replace(/\.00$/, '')}`;
  const subject = bump
    ? 'Your Holiday Prompt Pack + Muse Holiday Setup'
    : 'Your Holiday Prompt Pack is here';

  const btn = (l) => `
      <tr><td style="padding:0 0 14px;">
        <a href="${l.url}" style="display:block;background:#1f3b2d;border:1px solid #d4b466;border-radius:10px;padding:18px 22px;text-decoration:none;">
          <span style="display:block;font-family:Georgia,'Times New Roman',serif;font-size:19px;color:#f4ecdc;">${esc(l.label)}</span>
          <span style="display:block;font-family:Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#d4b466;margin-top:4px;">Download &middot; ${esc(l.sub).replace(/·/g, '&middot;')}</span>
        </a>
      </td></tr>`;

  const start = bump
    ? `<p style="margin:0 0 12px;">Start with the <b>Muse Holiday Setup</b>. Part 1 gets Muse on your phone in about ten minutes, Part 2 is the one Start Here prompt, and from there Muse interviews you, builds your Holiday HQ, and runs your first three holiday jobs with you.</p>
       <p style="margin:0;">Keep the Prompt Pack beside it. Every prompt in it is something Muse can now run for you.</p>`
    : `<p style="margin:0 0 12px;">Start with the <b>Holiday HQ Master Prompt</b>. Fill in your family once, paste it into ChatGPT, Claude, Gemini, or any assistant, and every prompt after it comes back personal.</p>
       <p style="margin:0;">Then pick the section you need this week. Nothing has to be done in order.</p>`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f5efe3;">
  <div style="max-width:600px;margin:0 auto;padding:28px 16px;">
    <div style="background:#1f3b2d;border-radius:12px;padding:40px 32px;text-align:center;">
      <div style="font-family:'Snell Roundhand',cursive;font-size:30px;color:#d4b466;">Thank you${first ? `, ${esc(first)}` : ''}</div>
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.2;color:#f4ecdc;margin-top:8px;text-transform:uppercase;letter-spacing:1px;">${bump ? 'Your holiday is handled' : 'Your pack is ready'}</div>
      <div style="width:60px;height:1px;background:#d4b466;margin:22px auto 0;"></div>
    </div>
    <div style="background:#ffffff;border-radius:12px;padding:32px;margin-top:14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#2a2a26;">
      <p style="margin:0 0 20px;">Here ${links.length > 1 ? 'are your downloads' : 'is your download'}. The link${links.length > 1 ? 's work' : ' works'} any time, so keep this email.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${links.map(btn).join('')}</table>
      <div style="border-top:1px solid #e6d7b6;margin:12px 0 20px;"></div>
      <div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#a88a45;margin-bottom:10px;">Where to start</div>
      ${start}
      <div style="border-top:1px solid #e6d7b6;margin:22px 0 16px;"></div>
      <table role="presentation" width="100%" style="font-size:13px;color:#57524a;">
        <tr><td>${esc(PACK.name)}</td><td align="right">$27</td></tr>
        ${bump ? `<tr><td>${esc(BUMP.name)}</td><td align="right">$47</td></tr>` : ''}
        <tr><td style="padding-top:6px;color:#2a2a26;"><b>Total paid</b></td><td align="right" style="padding-top:6px;color:#2a2a26;"><b>${total}</b></td></tr>
      </table>
      <p style="margin:18px 0 0;font-size:13px;color:#57524a;">Backed by a 30-day money-back guarantee. If it doesn't earn its place in your holiday, just reply to this email.</p>
    </div>
    <p style="font-family:Arial,sans-serif;font-size:11px;color:#8a8478;text-align:center;margin:18px 0 0;line-height:1.6;">
      Questions? Reply here or write to mvw@mattvincentwalker.com<br>
      &copy; ${new Date().getFullYear()} Superhuman LLC &middot; <a href="${SITE}/privacy" style="color:#8a8478;">Privacy</a> &middot; <a href="${SITE}/terms" style="color:#8a8478;">Terms</a>
    </p>
  </div>
</body></html>`;

  const text = [
    `Thank you${first ? `, ${first}` : ''}.`,
    '',
    'Your downloads (the links work any time):',
    ...links.map((l) => `- ${l.label}: ${l.url}`),
    '',
    `Total paid: ${total}`,
    '30-day money-back guarantee: just reply to this email.',
    '',
    'Matt Vincent Walker · mvw@mattvincentwalker.com',
  ].join('\n');

  return { subject, html, text };
}

export async function sendReceiptOnce(pi) {
  if (!pi || pi.status !== 'succeeded' || pi.metadata?.product !== PRODUCT_TAG) return { sent: false, reason: 'not-eligible' };
  if (pi.metadata?.receipt_sent === '1') return { sent: false, reason: 'already-sent' };
  const to = pi.metadata?.email || pi.receipt_email;
  const key = process.env.RESEND_API_KEY;
  if (!to || !key) return { sent: false, reason: !to ? 'no-email' : 'no-resend-key' };

  const { subject, html, text } = receiptEmail(pi);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `holiday-receipt-${pi.id}`,
    },
    body: JSON.stringify({
      from: 'Matt Vincent Walker <mvw@mattvincentwalker.com>',
      to: [to],
      reply_to: 'mvw@mattvincentwalker.com',
      subject,
      html,
      text,
      tags: [{ name: 'product', value: 'holiday' }],
    }),
  });
  if (!res.ok) {
    console.error('Resend receipt failed', res.status, await res.text().catch(() => ''));
    return { sent: false, reason: 'resend-error' };
  }
  try {
    await stripe('POST', `payment_intents/${pi.id}`, { metadata: { receipt_sent: '1' } });
  } catch (e) {
    console.warn('Could not flag receipt_sent on', pi.id, e.message);
  }
  return { sent: true };
}

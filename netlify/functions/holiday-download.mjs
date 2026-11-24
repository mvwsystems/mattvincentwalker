// GET /holiday/download?pi=pi_…&f=pack|muse&t=<token>   (rewritten here by netlify.toml)
// Streams a purchased PDF. The token ties the link to one order and one file;
// the order is re-checked with Stripe so refunded orders stop downloading.
import { getIntent, entitlements, verifyDownloadToken, readPrivateFile, isRefunded, FILES } from '../lib/holiday.mjs';

const page = (status, msg) => ({
  statusCode: status,
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  body: `<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Download</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#1f3b2d;color:#f4ecdc;font-family:Georgia,serif;text-align:center;padding:24px">
<div><p style="font-size:22px;margin:0 0 12px">${msg}</p>
<p style="font-family:Arial,sans-serif;font-size:14px;opacity:.8">Write to <a style="color:#d4b466" href="mailto:mvw@mattvincentwalker.com">mvw@mattvincentwalker.com</a> and we will sort it out.</p></div></body>`,
});

export const handler = async (event) => {
  const q = event.queryStringParameters || {};
  const piId = String(q.pi || '');
  const f = String(q.f || '');
  if (!/^pi_[A-Za-z0-9]+$/.test(piId) || !FILES[f] || !verifyDownloadToken(piId, f, String(q.t || ''))) {
    return page(403, 'That download link is not valid.');
  }

  let pi;
  try { pi = await getIntent(piId); } catch { return page(404, 'We could not find that order.'); }
  if (pi.status !== 'succeeded' || !entitlements(pi).includes(f)) return page(403, 'That download is not part of this order.');
  if (isRefunded(pi)) return page(410, 'This order was refunded, so the download is closed.');

  try {
    const buf = readPrivateFile(FILES[f].file);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${FILES[f].download}"`,
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex',
      },
      isBase64Encoded: true,
      body: buf.toString('base64'),
    };
  } catch (e) {
    console.error('holiday-download file error:', e.message);
    return page(500, 'The file is temporarily unavailable.');
  }
};

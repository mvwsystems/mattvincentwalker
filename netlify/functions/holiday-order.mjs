// GET /.netlify/functions/holiday-order?pi=pi_…&cs=pi_…_secret_…
// The thank-you pages call this with the params Stripe adds to the return URL.
// Verifies the payment server-side, returns the download links, and sends the
// receipt email if the webhook has not already done it.
import { json, getIntent, entitlements, downloadLinks, sendReceiptOnce, isRefunded, returnPathFor } from '../lib/holiday.mjs';

export const handler = async (event) => {
  const q = event.queryStringParameters || {};
  const piId = String(q.pi || '');
  const cs = String(q.cs || '');
  if (!/^pi_[A-Za-z0-9]+$/.test(piId) || !cs) return json(400, { ok: false, status: 'missing' });

  let pi;
  try {
    pi = await getIntent(piId);
  } catch (e) {
    console.error('holiday-order lookup failed:', e.message);
    return json(404, { ok: false, status: 'not_found' });
  }

  // The client secret proves this visitor is the buyer (it only ever reaches their browser).
  if (pi.client_secret !== cs || !entitlements(pi).length) return json(404, { ok: false, status: 'not_found' });

  const bump = pi.metadata?.bump === '1';
  const base = {
    ok: true,
    bump,
    path: returnPathFor(bump),
    email: pi.metadata?.email || pi.receipt_email || '',
    firstName: (pi.metadata?.name || '').trim().split(/\s+/)[0] || '',
    amount: pi.amount,
  };

  if (pi.status === 'processing') return json(200, { ...base, status: 'processing' });
  if (pi.status !== 'succeeded') return json(200, { ...base, status: 'failed' });
  if (isRefunded(pi)) return json(200, { ...base, status: 'refunded' });

  // Fallback delivery: whichever of webhook or this page gets there first sends the email.
  let receipt = { sent: false, reason: 'already-sent' };
  try { receipt = await sendReceiptOnce(pi); } catch (e) { console.error('receipt fallback failed:', e.message); }

  return json(200, { ...base, status: 'succeeded', downloads: downloadLinks(pi), emailed: receipt.sent || pi.metadata?.receipt_sent === '1' });
};

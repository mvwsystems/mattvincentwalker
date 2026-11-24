// POST /.netlify/functions/holiday-webhook   (Stripe → Developers → Webhooks)
// Listens for payment_intent.succeeded and emails the buyer their downloads,
// even if they closed the tab before the thank-you page loaded.
import { json, verifyStripeSignature, getIntent, sendReceiptOnce, PRODUCT_TAG } from '../lib/holiday.mjs';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false });

  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '';
  const sig = event.headers?.['stripe-signature'] || event.headers?.['Stripe-Signature'];
  if (!verifyStripeSignature(raw, sig, process.env.STRIPE_WEBHOOK_SECRET)) {
    return json(400, { ok: false, error: 'Bad signature' });
  }

  let evt;
  try { evt = JSON.parse(raw); } catch { return json(400, { ok: false }); }

  if (evt.type === 'payment_intent.succeeded' && evt.data?.object?.metadata?.product === PRODUCT_TAG) {
    try {
      // Re-fetch so the receipt_sent flag is current.
      const pi = await getIntent(evt.data.object.id);
      const r = await sendReceiptOnce(pi);
      console.log('holiday receipt', pi.id, r);
    } catch (e) {
      console.error('holiday-webhook failed:', e.message);
      return json(500, { ok: false }); // Stripe retries
    }
  }
  return json(200, { received: true });
};

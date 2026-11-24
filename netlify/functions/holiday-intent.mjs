// POST /.netlify/functions/holiday-intent   { name, email, bump: boolean }
// Creates the PaymentIntent the checkout page confirms. The amount is set here, never by the browser.
import { json, stripe, totalFor, returnPathFor, PACK, BUMP, PRODUCT_TAG } from '../lib/holiday.mjs';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false, error: 'Invalid request' }); }

  const clean = (v, max) => (typeof v === 'string' ? v.replace(/[<>]/g, '').trim().slice(0, max) : '');
  const name = clean(body.name, 120);
  const email = clean(body.email, 200).toLowerCase();
  const bump = body.bump === true;

  if (!name) return json(400, { ok: false, error: 'Please enter your name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json(400, { ok: false, error: 'Please enter a valid email address.' });

  try {
    const pi = await stripe('POST', 'payment_intents', {
      amount: totalFor(bump),
      currency: 'usd',
      automatic_payment_methods: { enabled: 'true' },
      receipt_email: email,
      description: bump ? `${PACK.name} + ${BUMP.name}` : PACK.name,
      metadata: {
        product: PRODUCT_TAG,
        bump: bump ? '1' : '0',
        name,
        email,
        items: bump ? 'pack,muse' : 'pack',
      },
    });
    return json(200, { ok: true, clientSecret: pi.client_secret, returnPath: returnPathFor(bump), amount: pi.amount });
  } catch (e) {
    console.error('holiday-intent failed:', e.message);
    return json(502, { ok: false, error: 'Checkout is unavailable for a moment. Please try again.' });
  }
};

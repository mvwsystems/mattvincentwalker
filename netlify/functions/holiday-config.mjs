// GET /.netlify/functions/holiday-config
// Hands the checkout page the publishable key, so switching test → live is an env change, not a deploy.
import { json, PACK, BUMP } from '../lib/holiday.mjs';

export const handler = async () => {
  const pk = process.env.STRIPE_PUBLISHABLE_KEY || '';
  const ready = Boolean(pk && process.env.STRIPE_SECRET_KEY);
  return json(200, {
    ready,
    publishableKey: ready ? pk : null,
    mode: pk.startsWith('pk_live_') ? 'live' : 'test',
    prices: { pack: PACK.amount, bump: BUMP.amount },
  });
};

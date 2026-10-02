// General subscribe handler for mattvincentwalker.com
// Receives: { email, source? }   source: hero | homepage | letter | subscribe-page | society | ...
// Does three things, in order of importance:
//   1. Emails The Grounding Protocol immediately via Resend (from Matt) — the promise on every door
//   2. Adds the subscriber to The Vincere Letter on Beehiiv (door recorded in utm_medium)
//   3. If Beehiiv refuses (plan/API), falls back to Kit with the vincere-letter tag so no one is lost
// Returns { ok: true, recorded: true|false, provider } — the UX always sees ok.

const SITE = 'https://mattvincentwalker.com';
const PROTOCOL_URL = `${SITE}/downloads/the-grounding-protocol.pdf`;

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ ok: false }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: JSON.stringify({ ok: false }) }; }

  const email = String(body.email || '').trim();
  const source = (String(body.source || 'website').replace(/[^a-z0-9_-]/gi, '').slice(0, 40)) || 'website';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Invalid email' }) };
  }

  const result = { ok: true, recorded: false, provider: null, protocol_sent: false };

  // ── 1. The Grounding Protocol, from Matt ────────────────────────────────
  result.protocol_sent = await sendProtocol(email);

  // ── 2. Beehiiv ──────────────────────────────────────────────────────────
  const bh = await beehiivSubscribe(email, source);
  if (bh.ok) { result.recorded = true; result.provider = 'beehiiv'; result.status = bh.status; }
  else {
    // ── 3. Kit fallback ───────────────────────────────────────────────────
    const kit = await kitSubscribe(email, source);
    if (kit.ok) { result.recorded = true; result.provider = 'kit'; }
  }

  return { statusCode: 200, body: JSON.stringify(result) };
};

async function beehiivSubscribe(email, source) {
  const apiKey = process.env.BEEHIIV_API_KEY, pubId = process.env.BEEHIIV_PUBLICATION_ID;
  if (!apiKey || !pubId) { console.error('[newsletter-subscribe] Beehiiv env missing'); return { ok: false }; }
  try {
    const res = await fetch(`https://api.beehiiv.com/v2/publications/${pubId}/subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        email,
        reactivate_existing: true,
        send_welcome_email: false,          // Resend already delivered the Protocol
        double_opt_override: 'off',         // they just typed their email into our form
        utm_source: 'mattvincentwalker.com',
        utm_medium: source,
        utm_campaign: 'vincere-letter',
        referring_site: SITE
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.data?.id) {
      console.error('[newsletter-subscribe] Beehiiv rejected:', res.status, JSON.stringify(data).slice(0, 300));
      return { ok: false };
    }
    return { ok: true, status: data.data.status };
  } catch (err) { console.error('[newsletter-subscribe] Beehiiv error:', err.message || err); return { ok: false }; }
}

async function kitSubscribe(email, source) {
  const apiKey = process.env.KIT_API_KEY;
  if (!apiKey) return { ok: false };
  const headers = { 'Content-Type': 'application/json', 'X-Kit-Api-Key': apiKey, 'Authorization': `Bearer ${apiKey}` };
  try {
    const subRes = await fetch('https://api.kit.com/v4/subscribers', { method: 'POST', headers, body: JSON.stringify({ email_address: email }) });
    if (!subRes.ok) { console.error('[newsletter-subscribe] Kit fallback rejected:', subRes.status); return { ok: false }; }
    for (const tagId of [process.env.KIT_NEWSLETTER_TAG_ID, source === 'society' ? process.env.KIT_SOCIETY_TAG_ID : null]) {
      if (!tagId) continue;
      await fetch(`https://api.kit.com/v4/tags/${tagId}/subscribers`, { method: 'POST', headers, body: JSON.stringify({ email_address: email }) }).catch(() => {});
    }
    console.warn('[newsletter-subscribe] recorded via Kit fallback');
    return { ok: true };
  } catch (err) { console.error('[newsletter-subscribe] Kit fallback error:', err.message || err); return { ok: false }; }
}

async function sendProtocol(email) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.error('[newsletter-subscribe] RESEND_API_KEY not set — Protocol not sent'); return false; }
  const text = `Here it is.

The Grounding Protocol — a short field manual for the moment what you're standing on can't hold your weight.

Download: ${PROTOCOL_URL}

Read Part I first — the diagnosis. There are seven false grounds in there: performance, approval, control, competence, productivity, being needed, being right. If one of them makes you wince, that's yours. Start there.

A few things so you know what you signed up for:

One letter a week. One thing I'm actually working through — as a husband, a dad, and a man trying to hold his faith while running a business — and the structure underneath it that you can use too.

No daily drip. No funnels. If I ever have something to sell you, I'll say so plainly.

Reply anytime. This address comes straight to me, and I read them.

— Matt

Vincere — Latin, "to overcome." The root of my middle name, and the reason I write.
${SITE}`;
  const html = `
<div style="margin:0;padding:0;background:#0c0a09;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0c0a09;"><tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:Georgia,'Times New Roman',serif;color:#d4cec4;">
  <tr><td style="font-family:Menlo,Consolas,monospace;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#8a6a3e;padding-bottom:28px;">The Vincere Letter</td></tr>
  <tr><td style="font-size:30px;line-height:1.2;color:#f5f1e9;padding-bottom:20px;">Here it is.</td></tr>
  <tr><td style="font-size:17px;line-height:1.7;padding-bottom:24px;">The Grounding Protocol &mdash; a short field manual for the moment what you&rsquo;re standing on can&rsquo;t hold your weight.</td></tr>
  <tr><td style="padding-bottom:32px;"><a href="${PROTOCOL_URL}" style="display:inline-block;background:#c8935a;color:#080808;text-decoration:none;font-family:Menlo,Consolas,monospace;font-size:11px;letter-spacing:3px;text-transform:uppercase;padding:16px 28px;">Download The Grounding Protocol</a></td></tr>
  <tr><td style="font-size:17px;line-height:1.7;padding-bottom:24px;">Read Part I first &mdash; the diagnosis. There are seven false grounds in there: performance, approval, control, competence, productivity, being needed, being right. If one of them makes you wince, that&rsquo;s yours. Start there.</td></tr>
  <tr><td style="font-size:17px;line-height:1.7;padding-bottom:16px;">A few things so you know what you signed up for:</td></tr>
  <tr><td style="font-size:17px;line-height:1.7;padding-bottom:16px;"><strong style="color:#f5f1e9;">One letter a week.</strong> One thing I&rsquo;m actually working through &mdash; as a husband, a dad, and a man trying to hold his faith while running a business &mdash; and the structure underneath it that you can use too.</td></tr>
  <tr><td style="font-size:17px;line-height:1.7;padding-bottom:16px;"><strong style="color:#f5f1e9;">No daily drip. No funnels.</strong> If I ever have something to sell you, I&rsquo;ll say so plainly.</td></tr>
  <tr><td style="font-size:17px;line-height:1.7;padding-bottom:28px;"><strong style="color:#f5f1e9;">Reply anytime.</strong> This address comes straight to me, and I read them.</td></tr>
  <tr><td style="font-size:17px;line-height:1.7;padding-bottom:36px;">&mdash; Matt</td></tr>
  <tr><td style="font-size:14px;line-height:1.6;color:#7a756d;font-style:italic;border-top:1px solid #2e2a22;padding-top:20px;">Vincere &mdash; Latin, &ldquo;to overcome.&rdquo; The root of my middle name, and the reason I write.<br><a href="${SITE}" style="color:#8a6a3e;">mattvincentwalker.com</a></td></tr>
</table></td></tr></table></div>`;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        from: 'Matt Vincent Walker <mvw@mattvincentwalker.com>',
        to: email,
        reply_to: 'mvw@mattvincentwalker.com',
        subject: 'The Grounding Protocol — and what to expect from me',
        text, html
      })
    });
    if (!res.ok) { console.error('[newsletter-subscribe] Resend rejected:', res.status, (await res.text()).slice(0, 200)); return false; }
    return true;
  } catch (err) { console.error('[newsletter-subscribe] Resend error:', err.message || err); return false; }
}

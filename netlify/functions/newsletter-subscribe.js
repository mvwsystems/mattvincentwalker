// General newsletter subscribe handler for mattvincentwalker.com
// Receives: { email, source? }  — source 'society' also applies KIT_SOCIETY_TAG_ID
// Actions: create/update Kit subscriber, apply KIT_NEWSLETTER_TAG_ID if set,
//          add to KIT_WELCOME_SEQUENCE_ID if set (delivers The Grounding Protocol)
// Returns { ok: true } on both success and upstream failure — never breaks UX

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ ok: false }) };
  }

  const { email, source } = body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Invalid email' }) };
  }

  const apiKey = process.env.KIT_API_KEY;
  if (!apiKey) {
    console.error('[newsletter-subscribe] KIT_API_KEY not set — subscriber not recorded');
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  try {
    // Create or update subscriber
    const subRes = await fetch('https://api.kit.com/v4/subscribers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Kit-Api-Key': apiKey,
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ email_address: String(email).trim() })
    });

    const subData = await subRes.json().catch(() => ({}));
    const subscriberId = subData?.subscriber?.id;
    if (!subRes.ok || !subscriberId) {
      console.error('[newsletter-subscribe] Kit rejected subscriber create:', subRes.status, JSON.stringify(subData).slice(0, 300));
      return { statusCode: 200, body: JSON.stringify({ ok: true, recorded: false }) };
    }

    // Apply general newsletter tag if configured
    const tagId = process.env.KIT_NEWSLETTER_TAG_ID;
    if (tagId && subscriberId) {
      const r = await fetch(`https://api.kit.com/v4/tags/${tagId}/subscribers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Kit-Api-Key': apiKey,
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({ email_address: String(email).trim() })
      });
      if (!r.ok) console.error('[newsletter-subscribe] Kit tags add failed:', r.status, (await r.text()).slice(0, 200));
    }

    // Society door: add the society tag so we can see who came in that way
    const societyTagId = process.env.KIT_SOCIETY_TAG_ID;
    if (source === 'society' && societyTagId && subscriberId) {
      const r = await fetch(`https://api.kit.com/v4/tags/${societyTagId}/subscribers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Kit-Api-Key': apiKey,
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({ email_address: String(email).trim() })
      });
      if (!r.ok) console.error('[newsletter-subscribe] Kit tags add failed:', r.status, (await r.text()).slice(0, 200));
    }

    // Add to the welcome sequence (sends The Grounding Protocol) if configured
    const seqId = process.env.KIT_WELCOME_SEQUENCE_ID;
    if (seqId && subscriberId) {
      const r = await fetch(`https://api.kit.com/v4/sequences/${seqId}/subscribers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Kit-Api-Key': apiKey,
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({ email_address: String(email).trim() })
      });
      if (!r.ok) console.error('[newsletter-subscribe] Kit sequences add failed:', r.status, (await r.text()).slice(0, 200));
    }
  } catch (err) {
    console.error('[newsletter-subscribe] Kit API error:', err.message || err);
    // Silent fail — return ok so the user sees success
    return { statusCode: 200, body: JSON.stringify({ ok: true, recorded: false }) };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true, recorded: true }) };
};

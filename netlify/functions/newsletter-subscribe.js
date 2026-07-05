// General newsletter subscribe handler for mattvincentwalker.com
// Receives: { email }
// Actions: create/update Kit subscriber, apply KIT_NEWSLETTER_TAG_ID if set
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

  const { email } = body;

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
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ email_address: String(email).trim() })
    });

    const subData = await subRes.json();
    const subscriberId = subData?.subscriber?.id;

    // Apply general newsletter tag if configured
    const tagId = process.env.KIT_NEWSLETTER_TAG_ID;
    if (tagId && subscriberId) {
      await fetch(`https://api.kit.com/v4/tags/${tagId}/subscribers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({ subscriber_id: subscriberId })
      });
    }
  } catch (err) {
    console.error('[newsletter-subscribe] Kit API error:', err.message || err);
    // Silent fail — return ok so the user sees success
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};

// Kit (ConvertKit) v4 subscriber handler for The Break Point funnel
// Triggered by: POST /.netlify/functions/kit-subscribe
// Receives: { firstName, email, shameLoad, band, primaryPattern, secondaryPattern, breach, part1–part5 }
// Actions: create/update subscriber with custom fields, apply completion tag + pattern tag
// The nurture sequence (email #1 = full report) lives in Kit, triggered by the break-point-completed tag.
// Part VII answers are NEVER included in this payload — privacy by architecture.

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }

  // ── PARSE & SANITIZE ──────────────────────────────────────────

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Invalid JSON' }) };
  }

  const strip = (val) =>
    typeof val === 'string'
      ? val.replace(/<[^>]*>/g, '').replace(/[<>"'&]/g, '').trim().slice(0, 500)
      : '';

  const firstName     = strip(body.firstName);
  const email         = strip(body.email);
  const shameLoad     = Math.max(40, Math.min(200, parseInt(body.shameLoad) || 0));
  const band          = strip(body.band);
  const primaryPat    = strip(body.primaryPattern);
  const secondaryPat  = strip(body.secondaryPattern || '');
  const breach        = Math.max(1, Math.min(5, parseInt(body.breach) || 0));
  const part1         = Math.max(8, Math.min(40, parseInt(body.part1) || 0));
  const part2         = Math.max(8, Math.min(40, parseInt(body.part2) || 0));
  const part3         = Math.max(8, Math.min(40, parseInt(body.part3) || 0));
  const part4         = Math.max(8, Math.min(40, parseInt(body.part4) || 0));
  const part5         = Math.max(8, Math.min(40, parseInt(body.part5) || 0));

  // Validate email
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Invalid email address' }) };
  }

  if (!firstName) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'First name is required' }) };
  }

  // ── ENV VARS ──────────────────────────────────────────────────

  const KIT_API_KEY = process.env.KIT_API_KEY;
  if (!KIT_API_KEY) {
    console.error('KIT_API_KEY is not set');
    // Return success to client — never expose backend config errors
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  // Tag IDs — set these in Netlify env vars after creating tags in Kit
  // To find tag IDs: Kit dashboard → Subscribers → Tags → click a tag → the ID is in the URL
  const KIT_TAG_ID      = process.env.KIT_TAG_ID;      // TODO_TAG_ID — tag: "break-point-completed"
  const KIT_TAG_RUNNER  = process.env.KIT_TAG_RUNNER;  // tag: "bp-runner"
  const KIT_TAG_FIXER   = process.env.KIT_TAG_FIXER;   // tag: "bp-fixer"
  const KIT_TAG_FADER   = process.env.KIT_TAG_FADER;   // tag: "bp-fader"
  const KIT_TAG_FIGHTER = process.env.KIT_TAG_FIGHTER;  // tag: "bp-fighter"

  const PATTERN_TAG_MAP = {
    RUNNER:  KIT_TAG_RUNNER,
    FIXER:   KIT_TAG_FIXER,
    FADER:   KIT_TAG_FADER,
    FIGHTER: KIT_TAG_FIGHTER
  };

  const KIT_BASE = 'https://api.convertkit.com/v4';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${KIT_API_KEY}`
  };

  // ── STEP 1: Create or update subscriber ──────────────────────

  let subscriberId;
  try {
    const subRes = await fetch(`${KIT_BASE}/subscribers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        first_name: firstName,
        email_address: email,
        fields: {
          bp_score:             String(shameLoad),
          bp_band:              band,
          bp_pattern:           primaryPat,
          bp_pattern_secondary: secondaryPat,
          bp_breach:            String(breach),
          bp_p1:                String(part1),
          bp_p2:                String(part2),
          bp_p3:                String(part3),
          bp_p4:                String(part4),
          bp_p5:                String(part5)
        }
      })
    });

    if (!subRes.ok) {
      const errBody = await subRes.text();
      console.error('Kit subscriber create/update failed:', subRes.status, errBody.slice(0, 300));
      // Return success — client should not see upstream error details
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    const subData = await subRes.json();
    subscriberId = subData?.subscriber?.id;

    if (!subscriberId) {
      console.error('Kit response missing subscriber.id:', JSON.stringify(subData).slice(0, 300));
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }
  } catch (err) {
    console.error('Kit network error (subscriber):', err.message);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  // ── STEP 2: Apply break-point-completed tag ───────────────────

  if (KIT_TAG_ID && subscriberId) {
    try {
      const tagRes = await fetch(`${KIT_BASE}/tags/${KIT_TAG_ID}/subscribers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ subscriber_id: subscriberId })
      });
      if (!tagRes.ok) {
        const errBody = await tagRes.text();
        console.error('Kit tag (completed) failed:', tagRes.status, errBody.slice(0, 300));
        // Non-fatal — continue to pattern tag
      }
    } catch (err) {
      console.error('Kit network error (completion tag):', err.message);
    }
  }

  // ── STEP 3: Apply pattern tag ─────────────────────────────────

  const patternTagId = PATTERN_TAG_MAP[primaryPat.toUpperCase()];
  if (patternTagId && subscriberId) {
    try {
      const patRes = await fetch(`${KIT_BASE}/tags/${patternTagId}/subscribers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ subscriber_id: subscriberId })
      });
      if (!patRes.ok) {
        const errBody = await patRes.text();
        console.error('Kit tag (pattern) failed:', patRes.status, errBody.slice(0, 300));
      }
    } catch (err) {
      console.error('Kit network error (pattern tag):', err.message);
    }
  }

  // ── DONE ──────────────────────────────────────────────────────

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true })
  };
};

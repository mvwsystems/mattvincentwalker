// Executive coaching application handler — emails the application to Matt via Resend.
// Triggered by: POST /.netlify/functions/coaching-apply
// Receives: { firstName, lastName, email, leads, ceiling, whyNow, readiness }

const RESEND_API = 'https://api.resend.com/emails';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Invalid JSON' }) };
  }

  const strip = (val, max = 500) =>
    typeof val === 'string'
      ? val.replace(/<[^>]*>/g, '').replace(/[<>"'&]/g, '').trim().slice(0, max)
      : '';

  const firstName = strip(body.firstName);
  const lastName  = strip(body.lastName);
  const email     = strip(body.email);
  const leads     = strip(body.leads);
  const ceiling   = strip(body.ceiling, 3000);
  const whyNow    = strip(body.whyNow, 3000);
  const readiness = strip(body.readiness, 120);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Invalid email address' }) };
  }
  if (!firstName) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'First name is required' }) };
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.error('RESEND_API_KEY is not set');
    // Return success to client — never expose backend config errors
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  const fullName = [firstName, lastName].filter(Boolean).join(' ');
  const row = (label, value) =>
    `<tr style="border-top:1px solid #ede8df;"><td style="padding:8px 0;color:#7a756d;width:180px;vertical-align:top;font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;">${label}</td><td style="padding:8px 0;color:#2a2520;">${value || '—'}</td></tr>`;

  const emailHtml = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f1ea;font-family:Georgia,serif;">
  <div style="max-width:640px;margin:0 auto;background:#fffdf9;">
    <div style="padding:32px 40px;border-bottom:1px solid #e8e0d0;">
      <h1 style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:4px;text-transform:uppercase;color:#8a6a3e;margin:0;">Executive Coaching Application</h1>
      <p style="font-size:22px;color:#2a2520;margin:12px 0 0;">${fullName}</p>
      <p style="font-size:13px;color:#7a756d;margin:4px 0 0;">${email}</p>
    </div>
    <div style="padding:32px 40px;background:#faf8f4;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;line-height:1.6;">
        ${row('Leads / Builds', leads)}
        ${row('The Ceiling', (ceiling || '—').replace(/\n/g, '<br>'))}
        ${row('Why Now', (whyNow || '—').replace(/\n/g, '<br>'))}
        ${row('Investment Readiness', readiness)}
      </table>
    </div>
    <div style="padding:20px 40px;border-top:1px solid #e8e0d0;">
      <p style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#b0a898;margin:0;">mattvincentwalker.com · Executive Coaching</p>
    </div>
  </div>
</body>
</html>`;

  try {
    const emailRes = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendKey}`
      },
      body: JSON.stringify({
        from: 'applications@mattvincentwalker.com',
        to: 'mvw@mattvincentwalker.com',
        reply_to: email,
        subject: `EXECUTIVE COACHING APPLICATION — ${fullName}`,
        html: emailHtml
      })
    });

    if (!emailRes.ok) {
      const errData = await emailRes.json();
      console.error('Resend error:', errData);
    }
  } catch (err) {
    console.error('Email send error:', err.message);
    // Still return success — Matt can check Netlify function logs if emails stop arriving
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const RESEND_API    = 'https://api.resend.com/emails';

export const handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  const { firstName, lastName, email, onlinePresence, business, aiProblem, whyNow, investment } = body;

  if (!email || !firstName) {
    return { statusCode: 400, body: JSON.stringify({ error: 'First name and email are required' }) };
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const resendKey    = process.env.RESEND_API_KEY;

  if (!anthropicKey || !resendKey) {
    console.error('Missing env vars: ANTHROPIC_API_KEY or RESEND_API_KEY');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  const fullName = [firstName, lastName].filter(Boolean).join(' ');

  // ── 1. RUN CLAUDE DIAGNOSTIC ──────────────────────────────────────────────
  const diagnosticPrompt = `You are Matt Vincent Walker's research analyst. Matt is a Chief AI Officer who embeds with founders and expert operators to install AI infrastructure — productizing their knowledge, systemizing their operations, and deploying custom AI. He receives consulting applications and needs a sharp pre-call diagnostic before speaking with each applicant.

Analyze this application. Be specific, direct, and analytical. Ground every observation in the actual data. Avoid generic statements.

APPLICATION DATA:
Name: ${fullName}
Email: ${email}
Online Presence / URLs: ${onlinePresence || 'Not provided'}
Business Description: ${business || 'Not provided'}
Primary AI Problem: ${aiProblem || 'Not provided'}
Investment Level: ${investment || 'Not provided'}
Why They're Reaching Out Now: ${whyNow || 'Not provided'}

Produce the following diagnostic sections:

## BRAND POSITIONING ASSESSMENT
Based on their online presence and business description: Where are they positioned in their market? What does their current brand signal? What gaps or opportunities are immediately visible from what they've shared?

## INFERRED NEEDS (beneath the stated problem)
What underlying needs or structural issues are likely present beyond what they've explicitly stated? What patterns typically accompany this type of operator at this investment level?

## FIT SIGNAL
Rate the apparent fit: Strong / Moderate / Weak. Support it with 2–3 specific observations pulled directly from the application.

## OUTREACH POSITIONING
How should Matt frame his reply or open the first call? What specific angle, tone, or language will land with this person? What objections or hesitations should he anticipate — and how to address them without overselling?

## FLAGS & OPPORTUNITIES
Anything that stands out — red flags, unusual strengths, specific leverage points, or opportunities Matt should be aware of before the conversation.

Keep the full diagnostic under 650 words. Be sharp. This is for Matt's eyes only — internal use, not for sharing with the applicant.`;

  let diagnostic = '';
  try {
    const claudeRes = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 1024,
        messages: [{ role: 'user', content: diagnosticPrompt }]
      })
    });

    const claudeData = await claudeRes.json();
    diagnostic = claudeData?.content?.[0]?.text || 'Diagnostic unavailable — Claude API did not return content.';
  } catch (err) {
    console.error('Claude API error:', err);
    diagnostic = 'Diagnostic generation failed. Review raw application data below.';
  }

  // ── 2. BUILD EMAIL HTML ───────────────────────────────────────────────────
  const diagHtml = diagnostic
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/## (.+)/g, '<h3 style="font-family:Georgia,serif;font-size:15px;font-weight:600;color:#0f0d0b;margin:28px 0 8px;padding-bottom:4px;border-bottom:1px solid #ddd;">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p style="margin:0 0 12px;line-height:1.7;">')
    .replace(/\n/g, '<br>');

  const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f1eb;font-family:Georgia,serif;">
  <div style="max-width:680px;margin:0 auto;background:#fff;border:1px solid #e0d8c8;">

    <!-- Header -->
    <div style="background:#0f0d0b;padding:32px 40px;">
      <p style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#8a6a3e;margin:0 0 8px;">Incoming Application</p>
      <h1 style="font-family:Georgia,serif;font-size:26px;font-weight:300;color:#f5f1e9;margin:0 0 4px;">AI CONSULTING APPLICATION</h1>
      <p style="font-family:'Courier New',monospace;font-size:11px;color:#6b4f2a;margin:0;">${fullName} — ${email}</p>
    </div>

    <!-- Application Data -->
    <div style="padding:32px 40px;border-bottom:1px solid #e8e0d0;background:#faf8f4;">
      <h2 style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:4px;text-transform:uppercase;color:#8a6a3e;margin:0 0 20px;">Raw Application</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;line-height:1.6;">
        <tr><td style="padding:8px 0;color:#7a756d;width:180px;vertical-align:top;font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;">Online Presence</td><td style="padding:8px 0;color:#2a2520;">${(onlinePresence || '—').replace(/\n/g, '<br>')}</td></tr>
        <tr style="border-top:1px solid #ede8df;"><td style="padding:8px 0;color:#7a756d;vertical-align:top;font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;">Business</td><td style="padding:8px 0;color:#2a2520;">${business || '—'}</td></tr>
        <tr style="border-top:1px solid #ede8df;"><td style="padding:8px 0;color:#7a756d;vertical-align:top;font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;">AI Problem</td><td style="padding:8px 0;color:#2a2520;">${(aiProblem || '—').replace(/\n/g, '<br>')}</td></tr>
        <tr style="border-top:1px solid #ede8df;"><td style="padding:8px 0;color:#7a756d;vertical-align:top;font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;">Why Now</td><td style="padding:8px 0;color:#2a2520;">${(whyNow || '—').replace(/\n/g, '<br>')}</td></tr>
        <tr style="border-top:1px solid #ede8df;"><td style="padding:8px 0;color:#7a756d;vertical-align:top;font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;">Investment Level</td><td style="padding:8px 0;color:#2a2520;">${investment || '—'}</td></tr>
      </table>
    </div>

    <!-- Claude Diagnostic -->
    <div style="padding:32px 40px;">
      <h2 style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:4px;text-transform:uppercase;color:#8a6a3e;margin:0 0 20px;">Pre-Call Diagnostic — Claude Analysis</h2>
      <div style="font-size:14px;color:#2a2520;line-height:1.75;">
        <p style="margin:0 0 12px;line-height:1.7;">${diagHtml}</p>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:20px 40px;border-top:1px solid #e8e0d0;background:#faf8f4;">
      <p style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#b0a898;margin:0;">mattvincentwalker.com · AI CONSULTING · For your eyes only</p>
    </div>

  </div>
</body>
</html>`;

  // ── 3. SEND EMAIL VIA RESEND ──────────────────────────────────────────────
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
        subject: `AI CONSULTING APPLICATION — ${fullName}`,
        html: emailHtml
      })
    });

    const emailData = await emailRes.json();
    if (!emailRes.ok) {
      console.error('Resend error:', emailData);
      throw new Error(emailData.message || 'Email delivery failed');
    }
  } catch (err) {
    console.error('Email send error:', err);
    // Still return success to the applicant — don't expose delivery failures
    // Matt can check Netlify function logs if emails stop arriving
  }

  return { statusCode: 200, body: JSON.stringify({ success: true }) };
};

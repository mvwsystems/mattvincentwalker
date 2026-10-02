// Finish Strong — "Email me my plan"
// Receives the structured plan from /finish-strong/ (see planPayload there).
// Actions: 1) email the plan to the man via Resend, from Matt, with the Protocol and the Break Point as the P.S.
//          2) add him to The Vincere Letter on Beehiiv (utm_medium=finish-strong, utm_campaign=leak-<area>-<score>),
//             Kit fallback if Beehiiv refuses
// Returns { ok, plan_sent, recorded, provider }

const SITE = 'https://mattvincentwalker.com';
const PROTOCOL_URL = `${SITE}/downloads/the-grounding-protocol.pdf`;
const MANUAL_URL = `${SITE}/downloads/finish-strong.pdf`;

const str = (v, n = 200) => (typeof v === 'string' ? v.replace(/<[^>]*>/g, '').trim().slice(0, n) : '');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const int = (v, lo, hi) => Math.max(lo, Math.min(hi, parseInt(v) || lo));

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ ok: false }) };
  let b; try { b = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, body: JSON.stringify({ ok: false }) }; }

  const firstName = str(b.firstName, 40), email = str(b.email, 120);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Invalid email' }) };
  if (!firstName) return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'First name required' }) };

  const plan = {
    days: int(b.days, 0, 366), sprint: int(b.sprint, 1, 90),
    scores: Object.fromEntries(Object.entries(b.scores || {}).slice(0, 6).map(([k, v]) => [str(k, 40), int(v, 1, 10)])),
    total: int(b.total, 6, 60), verdict: str(b.verdict, 40),
    leak: { name: str(b.leak?.name, 40), score: int(b.leak?.score, 1, 10), fix: str(b.leak?.fix, 240) },
    answers: { proudest: str(b.answers?.proudest), avoiding: str(b.answers?.avoiding), regret: str(b.answers?.regret) },
    goal: str(b.goal), why: str(b.why), stops: (b.stops || []).slice(0, 3).map(s => str(s)).filter(Boolean),
    phases: (b.phases || []).slice(0, 3).map(p => [str(p?.[0], 10), str(p?.[1], 60), str(p?.[2])]),
    weeks: (b.weeks || []).slice(0, 15).map(w => ({ n: int(w?.n, 1, 15), starts: str(w?.starts, 12), holiday: str(w?.holiday, 20), phase: str(w?.phase, 10), target: str(w?.target) })),
    obstacles: (b.obstacles || []).slice(0, 2).map(s => str(s)).filter(Boolean),
    rhythm: { nonNegotiable: str(b.rhythm?.nonNegotiable), friday: str(b.rhythm?.friday, 40), partner: str(b.rhythm?.partner, 40) }
  };

  const result = { ok: true, plan_sent: false, recorded: false, provider: null };
  result.plan_sent = await sendPlan(firstName, email, plan);

  const leakSlug = plan.leak.name.split(' ')[0].toLowerCase() || 'none';
  const bh = await beehiivSubscribe(email, `leak-${leakSlug}-${plan.total}`);
  if (bh.ok) { result.recorded = true; result.provider = 'beehiiv'; }
  else { const k = await kitSubscribe(email); if (k.ok) { result.recorded = true; result.provider = 'kit'; } }

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) };
};

async function beehiivSubscribe(email, campaign) {
  const apiKey = process.env.BEEHIIV_API_KEY, pubId = process.env.BEEHIIV_PUBLICATION_ID;
  if (!apiKey || !pubId) { console.error('[finish-strong] Beehiiv env missing'); return { ok: false }; }
  try {
    const res = await fetch(`https://api.beehiiv.com/v2/publications/${pubId}/subscriptions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ email, reactivate_existing: true, send_welcome_email: false, double_opt_override: 'off',
        utm_source: 'mattvincentwalker.com', utm_medium: 'finish-strong', utm_campaign: campaign, referring_site: `${SITE}/finish-strong/` })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.data?.id) { console.error('[finish-strong] Beehiiv rejected:', res.status, JSON.stringify(data).slice(0, 300)); return { ok: false }; }
    return { ok: true };
  } catch (err) { console.error('[finish-strong] Beehiiv error:', err.message || err); return { ok: false }; }
}

async function kitSubscribe(email) {
  const apiKey = process.env.KIT_API_KEY; if (!apiKey) return { ok: false };
  const headers = { 'Content-Type': 'application/json', 'X-Kit-Api-Key': apiKey, 'Authorization': `Bearer ${apiKey}` };
  try {
    const r = await fetch('https://api.kit.com/v4/subscribers', { method: 'POST', headers, body: JSON.stringify({ email_address: email }) });
    if (!r.ok) return { ok: false };
    if (process.env.KIT_NEWSLETTER_TAG_ID) await fetch(`https://api.kit.com/v4/tags/${process.env.KIT_NEWSLETTER_TAG_ID}/subscribers`, { method: 'POST', headers, body: JSON.stringify({ email_address: email }) }).catch(() => {});
    console.warn('[finish-strong] recorded via Kit fallback'); return { ok: true };
  } catch { return { ok: false }; }
}

async function sendPlan(firstName, email, p) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.error('[finish-strong] RESEND_API_KEY not set — plan not sent'); return false; }
  const label = (t) => `<tr><td style="font-family:Menlo,Consolas,monospace;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#8a6a3e;padding:30px 0 10px;border-top:1px solid #2e2a22;">${t}</td></tr>`;
  const para = (h) => `<tr><td style="font-size:16px;line-height:1.7;color:#d4cec4;padding-bottom:14px;">${h}</td></tr>`;
  const name = esc(firstName);
  const dash = '<span style="color:#7a756d;">&mdash;</span>';

  let rows = '';
  rows += `<tr><td style="font-family:Menlo,Consolas,monospace;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#8a6a3e;padding-bottom:28px;">Finish Strong &middot; Your ${p.sprint}-day plan</td></tr>`;
  rows += `<tr><td style="font-size:18px;line-height:1.6;color:#a09a90;padding-bottom:8px;">${name},</td></tr>`;
  rows += `<tr><td style="font-size:30px;line-height:1.2;color:#f5f1e9;padding-bottom:22px;">${p.days} days left. Here&rsquo;s your plan.</td></tr>`;
  rows += para(`You built this. I&rsquo;m just sending it back to you so it&rsquo;s still here on a Friday in week six when the tab is long gone. Read it again then.`);

  rows += label(`Your score &middot; ${p.total} / 60 &middot; ${esc(p.verdict)}`);
  rows += `<tr><td style="padding-bottom:6px;"><table role="presentation" cellpadding="0" cellspacing="0" style="font-size:15px;color:#d4cec4;">${Object.entries(p.scores).map(([k, v]) => `<tr><td style="padding:4px 18px 4px 0;${k === p.leak.name ? 'color:#f5f1e9;' : ''}">${esc(k.split(' and ')[0])}</td><td style="padding:4px 0;color:#c8935a;">${'&#9632;'.repeat(v)}<span style="color:#2e2a22;">${'&#9632;'.repeat(10 - v)}</span></td><td style="padding:4px 0 4px 12px;color:#7a756d;">${v}</td></tr>`).join('')}</table></td></tr>`;
  rows += para(`<strong style="color:#f5f1e9;">Fix the leak first: ${esc(p.leak.name)} (${p.leak.score}/10).</strong> ${esc(p.leak.fix)}`);

  if (p.answers.proudest || p.answers.avoiding || p.answers.regret) {
    rows += label('Three honest answers');
    if (p.answers.proudest) rows += para(`<strong style="color:#f5f1e9;">Proudest of:</strong> ${esc(p.answers.proudest)}`);
    if (p.answers.avoiding) rows += para(`<strong style="color:#f5f1e9;">Avoiding:</strong> ${esc(p.answers.avoiding)}`);
    if (p.answers.regret) rows += para(`<strong style="color:#f5f1e9;">Would regret:</strong> ${esc(p.answers.regret)}`);
  }

  rows += label('Finish Line goal');
  rows += `<tr><td style="font-size:24px;line-height:1.3;font-style:italic;color:#eae4d8;padding-bottom:14px;">By December 31, I will ${esc(p.goal) || '&hellip;'}</td></tr>`;
  if (p.why) rows += para(`<strong style="color:#f5f1e9;">Why it matters:</strong> ${esc(p.why)}`);
  if (p.stops.length) rows += para(`<strong style="color:#f5f1e9;">Stopping until January 1:</strong> ${p.stops.map(esc).join(' &middot; ')}`);

  rows += label(`The ${p.sprint}-day sprint`);
  rows += `<tr><td style="padding-bottom:10px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#d4cec4;border-collapse:collapse;">`;
  let lastPhase = null;
  for (const w of p.weeks) {
    if (w.phase !== lastPhase) {
      const ph = p.phases.find(x => x[0] === w.phase);
      rows += `<tr><td colspan="3" style="font-family:Menlo,Consolas,monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8a6a3e;padding:14px 0 6px;">${esc(w.phase)}${ph && ph[2] ? ` &middot; ${esc(ph[2])}` : ''}</td></tr>`;
      lastPhase = w.phase;
    }
    rows += `<tr><td style="padding:7px 10px 7px 0;color:#7a756d;white-space:nowrap;border-bottom:1px solid #2e2a22;">Wk ${w.n}</td><td style="padding:7px 10px 7px 0;color:#a09a90;white-space:nowrap;border-bottom:1px solid #2e2a22;">${esc(w.starts)}${w.holiday ? ` <span style="color:#8a6a3e;">(${esc(w.holiday)})</span>` : ''}</td><td style="padding:7px 0;border-bottom:1px solid #2e2a22;">${w.target ? esc(w.target) : dash}</td></tr>`;
  }
  rows += `</table></td></tr>`;

  if (p.obstacles.length) { rows += label('If this happens, I will'); p.obstacles.forEach(o => rows += para(esc(o))); }

  rows += label('Rhythm');
  rows += para(`<strong style="color:#f5f1e9;">Daily 3-3-1.</strong> Three minutes in the morning: pick today&rsquo;s one move, do it before email. Three minutes at night: check it, set tomorrow&rsquo;s.${p.rhythm.nonNegotiable ? ` <strong style="color:#f5f1e9;">Non-negotiable:</strong> ${esc(p.rhythm.nonNegotiable)}.` : ''}`);
  rows += para(`<strong style="color:#f5f1e9;">Friday 15:</strong> ${esc(p.rhythm.friday) || 'pick a time and put it on the calendar'}. Did I hit the target? What worked? What&rsquo;s next week&rsquo;s? Which area got neglected?`);
  rows += para(`<strong style="color:#f5f1e9;">The man who holds you to it:</strong> ${esc(p.rhythm.partner) || 'pick one'}. Text him your goal today and your Friday score every week. Shame&rsquo;s whole power supply is secrecy. This is how you cut it.`);

  rows += label('Next 24 hours');
  rows += para(`1. Send your goal to ${esc(p.rhythm.partner) || 'your man'}.<br>2. Put the Friday 15 on the calendar for every week through December.<br>3. Do week one&rsquo;s first move tomorrow, before email.`);
  rows += `<tr><td style="padding:6px 0 24px;"><a href="${MANUAL_URL}" style="display:inline-block;background:#c8935a;color:#080808;text-decoration:none;font-family:Menlo,Consolas,monospace;font-size:11px;letter-spacing:3px;text-transform:uppercase;padding:14px 24px;">Download the field manual</a></td></tr>`;

  rows += label('Before the plan, the man');
  rows += para(`A plan holds only as well as what it&rsquo;s standing on. Every man breaks somewhere &mdash; <a href="${SITE}/break-point/" style="color:#c8935a;">fifteen honest answers tell you where</a>, and what you&rsquo;re actually standing on. And <a href="${PROTOCOL_URL}" style="color:#c8935a;">The Grounding Protocol</a> is the manual for when that ground can&rsquo;t hold your weight. Both free. Both yours.`);
  rows += para(`One letter a week from me after this &mdash; inner order, real connection, work that doesn&rsquo;t eat your life. No daily drip. Reply anytime; it comes straight to me.`);
  rows += para(`&mdash; Matt`);
  rows += `<tr><td style="font-size:13px;line-height:1.6;color:#7a756d;font-style:italic;border-top:1px solid #2e2a22;padding-top:18px;">Vincere &mdash; Latin, &ldquo;to overcome.&rdquo; <a href="${SITE}" style="color:#8a6a3e;">mattvincentwalker.com</a></td></tr>`;

  const html = `<div style="margin:0;padding:0;background:#0c0a09;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0c0a09;"><tr><td align="center" style="padding:40px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;font-family:Georgia,'Times New Roman',serif;">${rows}</table></td></tr></table></div>`;
  const text = html.replace(/<br\s*\/?>/g, '\n').replace(/<\/(tr|td|p)>/g, '\n').replace(/<[^>]+>/g, '').replace(/&rsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').replace(/&mdash;/g, '—').replace(/&middot;/g, '·').replace(/&hellip;/g, '…').replace(/&#9632;/g, '■').replace(/&amp;/g, '&').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ from: 'Matt Vincent Walker <mvw@mattvincentwalker.com>', to: email, reply_to: 'mvw@mattvincentwalker.com',
        subject: `${firstName}, your Finish Strong plan — ${p.days} days`, html, text })
    });
    if (!res.ok) { console.error('[finish-strong] Resend rejected:', res.status, (await res.text()).slice(0, 200)); return false; }
    return true;
  } catch (err) { console.error('[finish-strong] Resend error:', err.message || err); return false; }
}

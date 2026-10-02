// The Break Point — field report handler
// Receives (fast):  { mode:'fast', firstName, email, primaryPattern, secondaryPattern?, ground, groundScores? }
// Receives (full):  { mode:'full', firstName, email, shameLoad, band, primaryPattern, secondaryPattern?, breach, part1..part5 }
// Actions: 1) email the personal field report via Resend (from Matt, with the Protocol attached as a link)
//          2) add to The Vincere Letter on Beehiiv — result encoded in UTM fields (utm_medium=break-point,
//             utm_campaign=<mode>-<pattern>-<ground>) — with a Kit fallback
// Part VII written answers are never sent here. Privacy by architecture.

const SITE = 'https://mattvincentwalker.com';
const PROTOCOL_URL = `${SITE}/downloads/the-grounding-protocol.pdf`;

const PATTERNS = {
  RUNNER: { name: 'The Runner', sub: 'Velocity as anesthesia',
    body: [`The Runner's armor is <strong>forward momentum</strong>. When shame loads, you build. When exposure arrives, you pivot. The business, the next venture, the next goal — movement is the most sophisticated anesthetic ever invented for this pattern, because it looks identical to ambition from the outside.`,
           `The tell is that your pace <em>accelerates after failure</em>, not despite it. That you announce the next project within days of the last one detonating. That rest — real rest, not recovery-as-optimization — produces a specific kind of dread that you've learned to outrun by staying in motion.`,
           `<strong>What it costs you:</strong> the people trying to reach you while you're building. The part of yourself that needs to be still long enough to be known. The Runner builds impressive things. He rarely finishes them before he's already ten miles past them.`],
    breaks: `The break point for the Runner is not a crash. It's a quiet Wednesday when there's nothing left to run toward — and the thing he's been running from has been sitting in the house the whole time.`,
    move: `<strong>One sit.</strong> Ten minutes, phone in another room, nothing to build. Every day. The Runner's first move is a stillness short enough that he can't outrun it.` },
  FIXER: { name: 'The Fixer', sub: 'Indispensability as immunity',
    body: [`The Fixer's armor is <strong>service</strong>. Not service as love — service as a system for keeping the verdict at bay. If you are solving problems, carrying others, being needed, then you are not the problem. You are the solution. And solutions don't get put on trial.`,
           `The tell is that you flip the conversation to <em>their</em> needs within 90 seconds. That your emotional labor for others exceeds what you'd ever ask of yourself. That you are exhausted in a specific way — not from external demand, but from the internal vigilance required to make sure your indispensability never lapses.`,
           `<strong>What it costs you:</strong> the people who want to know you rather than be helped by you. Your own needs, which you've learned to route around so efficiently you sometimes forget they exist.`],
    breaks: `The Fixer breaks when the person he's been holding up finally stands on their own. Or when someone looks past the helping and asks what he actually needs. The answer surprises him. He hasn't thought about it in years.`,
    move: `<strong>One ask.</strong> Every day, ask someone for something you could have done yourself. The Fixer's first move is receiving.` },
  FADER: { name: 'The Fader', sub: 'Smallness as safety',
    body: [`The Fader's armor is <strong>disappearance</strong>. Not the dramatic withdrawal — the slow, calibrated shrinking of the target. If you want less, risk less, expect less, you can fail less visibly. Shame cannot land on a man who has already disqualified himself from the field.`,
           `The tell is that your ambitions have become more "realistic" over the years in ways that track precisely to your failures and exposures. That the dreams are still there — you can still feel them — but they live behind glass now, labeled "someone else's territory."`,
           `<strong>What it costs you:</strong> the life that was actually yours to live. The people who wanted the full version of you and eventually learned to stop asking for it.`],
    breaks: `The Fader breaks quietly. Not a blow-up — a dimming. A morning when the low-grade gone-ness has been present long enough that it's hard to remember what the light felt like.`,
    move: `<strong>One reach.</strong> Every day, one message to a man who could actually know you — not logistics, not sports. The Fader's first move is being seen on purpose.` },
  FIGHTER: { name: 'The Fighter', sub: 'Offense as self-defense',
    body: [`The Fighter's armor is <strong>voltage</strong>. Shame is not metabolized — it is converted. Converted to anger, to criticism, to the specific electricity that makes rooms go quiet. Aggression is faster than grief, and it feels better, and it keeps the target off your chest and on someone else's.`,
           `The tell is that your anger arrives faster than your hurt. That sarcasm is a close companion. That you've never fully lost an argument, even when you were wrong. That you're alert, always, to status moves in the room.`,
           `<strong>What it costs you:</strong> the people who were trying to get close before they learned not to try. The feedback that stopped coming because the messenger learned what happens to messengers.`],
    breaks: `The Fighter breaks when someone he needed to keep finally doesn't come back. Not from a fight — from a quiet decision. The violence of a closed door is particular to this pattern.`,
    move: `<strong>One pause.</strong> When the heat comes, three seconds before the sentence. Every time. The Fighter's first move is the gap between the hurt and the voltage.` }
};

const GROUNDS = {
  PERFORMANCE:  { name: 'Performance',  belief: 'I am what I produce.',
    text: `It shows up as burnout you call drive, exhaustion you call discipline, and an inability to rest that you've mistaken for work ethic. Pressure finds you the day the results stop — because that's the day you stop existing to yourself.` },
  APPROVAL:     { name: 'Approval',     belief: 'I am what others think of me.',
    text: `Boundaries collapse. Yes blurs into resentment. You edit yourself depending on who's in the room. Pressure finds you when the room turns — or when you finally notice you don't know what you actually think.` },
  CONTROL:      { name: 'Control',      belief: 'I am safe when I manage outcomes.',
    text: `Anxiety, micromanagement, a hunger for more information than you can act on. Pressure finds you where the outcome is out of your hands — a diagnosis, a market, a child.` },
  COMPETENCE:   { name: 'Competence',   belief: 'I am my expertise.',
    text: `Imposter dread, defensive posturing, a quiet fear of being found out. Pressure finds you in the room where you don't know — and can't admit it.` },
  PRODUCTIVITY: { name: 'Productivity', belief: 'I am my output.',
    text: `Workaholism, guilt when you rest, an identity that goes blank in stillness. Pressure finds you on vacation, on a Sunday, in a hospital waiting room — anywhere nothing can be done.` },
  BEING_NEEDED: { name: 'Being Needed', belief: 'I am my usefulness.',
    text: `Over-functioning, carrying what isn't yours, a resentment you'd never say out loud. Pressure finds you when the people you hold up stand on their own — and you don't know your place anymore.` },
  BEING_RIGHT:  { name: 'Being Right',  belief: 'I am my correctness.',
    text: `Intellectual pride, trouble receiving correction, an isolation that looks like conviction. Pressure finds you when being right costs you someone — and it already has.` }
};

const BANDS = {
  'LIGHT LOAD': `Your load is below threshold. Either you've done real prior work on this, or the compensations are holding well enough that the load hasn't registered yet. The caution: a light load with no prior inner work often means a defense system refined enough that even honest self-report misses the signal. Worth examining with another person.`,
  'FUNCTIONAL LOAD': `Your load is active but subcritical — consistent drag without structural failure yet. This is the most dangerous band on the instrument, because men here perform well enough to avoid confronting what they're carrying. The crisis hasn't come. The compensation is working. That is exactly how the crack goes unaddressed until it becomes structural.`,
  'STRUCTURAL LOAD': `Your load has passed the functional threshold. It is no longer adding friction to your decisions — it is determining them. You are not carrying this alongside your life; you are building your life around it. This is not a verdict on your character. It is a reading of your load, and men in this band are often the most capable men in the room — which is why the shame has had such good infrastructure to hide in.`,
  'CRITICAL LOAD': `Your load is in critical range. Not a scare line — a read of what you reported across forty statements about your actual behavior. The question is no longer whether something will give, but where, and when, and whether you choose the timing. Men here are not weak. They are often the strongest men in their circles, which is how they got here. The work from here is a person, not a program.`
};

const BREACH = {
  1: ['Identity', `Your breach runs through identity — where "I made a mistake" becomes "I am a mistake." The work is distinguishing the thing from the person who did it.`],
  2: ['Armor', `Your breach runs through armor — the specific way you hide, and the cost of maintaining the hide. Armor that worked in a crisis becomes a prison in a life.`],
  3: ['Approval', `Your breach runs through approval — whose voice is still delivering the verdict, and how much of what you've built has been a case for the defense.`],
  4: ['Ownership', `Your breach runs through ownership — carrying what was never yours, or dropping what always was. The work is finding the actual property lines.`],
  5: ['Isolation', `Your breach runs through isolation — and this is the one that powers all the others. Shame requires secrecy to stay potent. Nothing else in this audit shifts until someone actually knows you.`]
};

const strip = (v, n = 80) => (typeof v === 'string' ? v.replace(/<[^>]*>/g, '').replace(/[<>"'&]/g, '').trim().slice(0, n) : '');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ ok: false }) };
  let b; try { b = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, body: JSON.stringify({ ok: false }) }; }

  const mode = b.mode === 'full' ? 'full' : 'fast';
  const firstName = strip(b.firstName, 40);
  const email = strip(b.email, 120);
  const pattern = PATTERNS[strip(b.primaryPattern).toUpperCase()] ? strip(b.primaryPattern).toUpperCase() : null;
  const secondary = PATTERNS[strip(b.secondaryPattern || '').toUpperCase()] ? strip(b.secondaryPattern).toUpperCase() : null;
  const ground = GROUNDS[strip(b.ground || '').toUpperCase()] ? strip(b.ground).toUpperCase() : null;
  const shameLoad = Math.max(40, Math.min(200, parseInt(b.shameLoad) || 0));
  const band = BANDS[strip(b.band)] ? strip(b.band) : null;
  const breach = Math.max(1, Math.min(5, parseInt(b.breach) || 0));

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Invalid email' }) };
  if (!firstName) return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'First name required' }) };
  if (!pattern) return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Missing pattern' }) };

  const result = { ok: true, report_sent: false, recorded: false, provider: null };

  // ── 1. The field report, from Matt ─────────────────────────────────────
  result.report_sent = await sendReport({ mode, firstName, email, pattern, secondary, ground, shameLoad, band, breach });

  // ── 2. The list ─────────────────────────────────────────────────────────
  const campaign = [mode, pattern, ground || band?.split(' ')[0]].filter(Boolean).join('-').toLowerCase();
  const bh = await beehiivSubscribe(email, campaign);
  if (bh.ok) { result.recorded = true; result.provider = 'beehiiv'; }
  else { const k = await kitSubscribe(email); if (k.ok) { result.recorded = true; result.provider = 'kit'; } }

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) };
};

async function beehiivSubscribe(email, campaign) {
  const apiKey = process.env.BEEHIIV_API_KEY, pubId = process.env.BEEHIIV_PUBLICATION_ID;
  if (!apiKey || !pubId) { console.error('[break-point-report] Beehiiv env missing'); return { ok: false }; }
  try {
    const res = await fetch(`https://api.beehiiv.com/v2/publications/${pubId}/subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        email, reactivate_existing: true, send_welcome_email: false, double_opt_override: 'off',
        utm_source: 'mattvincentwalker.com', utm_medium: 'break-point', utm_campaign: campaign, referring_site: `${SITE}/break-point/`
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.data?.id) { console.error('[break-point-report] Beehiiv rejected:', res.status, JSON.stringify(data).slice(0, 300)); return { ok: false }; }
    return { ok: true };
  } catch (err) { console.error('[break-point-report] Beehiiv error:', err.message || err); return { ok: false }; }
}

async function kitSubscribe(email) {
  const apiKey = process.env.KIT_API_KEY; if (!apiKey) return { ok: false };
  const headers = { 'Content-Type': 'application/json', 'X-Kit-Api-Key': apiKey, 'Authorization': `Bearer ${apiKey}` };
  try {
    const r = await fetch('https://api.kit.com/v4/subscribers', { method: 'POST', headers, body: JSON.stringify({ email_address: email }) });
    if (!r.ok) return { ok: false };
    if (process.env.KIT_NEWSLETTER_TAG_ID) await fetch(`https://api.kit.com/v4/tags/${process.env.KIT_NEWSLETTER_TAG_ID}/subscribers`, { method: 'POST', headers, body: JSON.stringify({ email_address: email }) }).catch(() => {});
    console.warn('[break-point-report] recorded via Kit fallback'); return { ok: true };
  } catch { return { ok: false }; }
}

async function sendReport(d) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.error('[break-point-report] RESEND_API_KEY not set — report not sent'); return false; }
  const P = PATTERNS[d.pattern], G = d.ground ? GROUNDS[d.ground] : null, S = d.secondary ? PATTERNS[d.secondary] : null;
  const name = esc(d.firstName);
  const verdict = G ? `You&rsquo;re <em>${P.name}</em>, standing on <em>${G.name}</em>.` : `You&rsquo;re <em>${P.name}</em>.`;
  const subject = G ? `${d.firstName}, you're ${P.name} standing on ${G.name}` : `${d.firstName}, your Break Point report: ${d.band || P.name}`;

  const sec = (label, inner) => `
  <tr><td style="font-family:Menlo,Consolas,monospace;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#8a6a3e;padding:34px 0 12px;border-top:1px solid #2e2a22;">${label}</td></tr>
  ${inner}`;
  const para = (html) => `<tr><td style="font-size:16px;line-height:1.7;color:#d4cec4;padding-bottom:16px;">${html}</td></tr>`;
  const big = (html) => `<tr><td style="font-size:22px;line-height:1.35;color:#f5f1e9;padding-bottom:14px;">${html}</td></tr>`;

  let rows = '';
  rows += `<tr><td style="font-family:Menlo,Consolas,monospace;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#8a6a3e;padding-bottom:28px;">The Break Point &middot; Field Report</td></tr>`;
  rows += `<tr><td style="font-size:18px;line-height:1.6;color:#a09a90;padding-bottom:10px;">${name},</td></tr>`;
  rows += `<tr><td style="font-size:32px;line-height:1.2;color:#f5f1e9;padding-bottom:28px;">${verdict}</td></tr>`;
  rows += para(`This is what you told me across the audit, read back without flinching. Read it slowly. Then do the one thing at the bottom.`);

  if (d.mode === 'full' && d.band) {
    rows += sec(`Your load &middot; ${d.shameLoad} / 200 &middot; ${esc(d.band)}`, para(BANDS[d.band]));
  }
  rows += sec(`Your pattern &middot; ${P.name}`, big(P.sub) + P.body.map(para).join('') + para(`<em>${P.breaks}</em>`));
  if (S) rows += para(`<strong>Split pattern:</strong> your answers show a close second — ${S.name}. These two usually rotate: one surfaces under one kind of pressure, the other under a different kind. Both are load-bearing.`);
  if (G) rows += sec(`Your ground &middot; ${G.name}`, big(`&ldquo;${G.belief}&rdquo;`) + para(G.text) + para(`That belief is the thing you treat as most real when the pressure comes. Not what you say you believe &mdash; what you default to when the system is stressed. It&rsquo;s a functional god, and every god eventually demands sacrifice.`));
  if (d.mode === 'full' && BREACH[d.breach]) rows += sec(`Where the pressure gets in &middot; ${BREACH[d.breach][0]}`, para(BREACH[d.breach][1]));

  rows += sec('Your first move', para(P.move) + para(`<strong>And one note to your wife</strong> &mdash; or whoever is closest to you. Every day. That one was mine, back when I had nothing else. It&rsquo;s still the one that matters most.`));
  rows += sec('The manual', para(`The Grounding Protocol is the manual for your ground. Read Part I, then find <strong>${G ? G.name : 'your ground'}</strong> in the seven false grounds and read that section twice. Then Part VI &mdash; the daily protocol.`) +
    `<tr><td style="padding:4px 0 20px;"><a href="${PROTOCOL_URL}" style="display:inline-block;background:#c8935a;color:#080808;text-decoration:none;font-family:Menlo,Consolas,monospace;font-size:11px;letter-spacing:3px;text-transform:uppercase;padding:16px 28px;">Download The Grounding Protocol</a></td></tr>`);
  if (d.mode === 'fast') rows += sec('Go deeper', para(`This was the short read. The full audit is forty statements across five domains &mdash; identity, armor, approval, ownership, isolation &mdash; and it tells you your load and exactly where the pressure gets in. Twenty minutes. Do it alone.<br><a href="${SITE}/break-point/full/" style="color:#c8935a;">Take the full audit &rarr;</a>`));
  rows += sec('What happens next', para(`One letter a week from me &mdash; inner order, real connection, work that doesn&rsquo;t eat your life. No daily drip, no funnels. And if you want to say what&rsquo;s actually going on to one other man, <a href="${SITE}/coaching" style="color:#c8935a;">here&rsquo;s where that starts</a>.`) + para(`Reply to this email anytime. It comes straight to me.`) + para(`&mdash; Matt`));
  rows += `<tr><td style="font-size:13px;line-height:1.6;color:#7a756d;font-style:italic;border-top:1px solid #2e2a22;padding-top:20px;">Your written answers from Part VII were never sent anywhere. They&rsquo;re yours.<br>Vincere &mdash; Latin, &ldquo;to overcome.&rdquo; <a href="${SITE}" style="color:#8a6a3e;">mattvincentwalker.com</a></td></tr>`;

  const html = `<div style="margin:0;padding:0;background:#0c0a09;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0c0a09;"><tr><td align="center" style="padding:40px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;font-family:Georgia,'Times New Roman',serif;">${rows}</table></td></tr></table></div>`;
  const text = html.replace(/<style[^>]*>.*?<\/style>/gs, '').replace(/<br\s*\/?>/g, '\n').replace(/<\/(tr|p|td)>/g, '\n').replace(/<[^>]+>/g, '').replace(/&rsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').replace(/&mdash;/g, '—').replace(/&middot;/g, '·').replace(/&rarr;/g, '→').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ from: 'Matt Vincent Walker <mvw@mattvincentwalker.com>', to: d.email, reply_to: 'mvw@mattvincentwalker.com', subject, html, text })
    });
    if (!res.ok) { console.error('[break-point-report] Resend rejected:', res.status, (await res.text()).slice(0, 200)); return false; }
    return true;
  } catch (err) { console.error('[break-point-report] Resend error:', err.message || err); return false; }
}

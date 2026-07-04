# LESSONS.md — The Break Point Build Log

Decisions made, corrections applied, and things the next build should know.

---

## Architecture Decisions

**Session storage over cookies.** All state passes via `sessionStorage` (`breakpoint_results`, `breakpoint_progress`, `breakpoint_firstName`). No cookies, no analytics additions. This aligns with the existing site's no-tracking posture and is appropriate for a personally sensitive instrument.

**Part VII is deliberately untracked.** Written answers are never stored in sessionStorage, never included in the Kit payload, never transmitted. This is enforced by architecture, not just by omission: the textarea values are never read programmatically. The QA check "verify Part VII text never appears in any network request" should be run manually in DevTools on every deploy. Data attribute `data-private="true"` marks these elements for any future audit.

**Auto-resume on page refresh.** When a user has in-progress answers in sessionStorage and refreshes the quiz page, the quiz auto-resumes at their last part. Assumption: most mobile refreshes are accidental. This was the right call for completion rate on a long-form instrument.

**Scoring tie-breakers.** Breach tie → Part V outranks all; otherwise the later part number wins. Pattern tie → first selection chronologically wins (tracked via `p6SelectionOrder` array). These are encoded exactly per the spec.

**Split pattern threshold.** `splitPattern = true` when `(primaryCount - secondaryCount) <= 2`. Deliberately inclusive — at 8 scenarios, a 5/3 split is meaningful.

---

## TODOs Required Before Launch

1. **Set Kit env vars in Netlify Dashboard.** See `.env.example`. The function returns `ok:true` even if the key is missing (silent failure) — intentional so the client UX doesn't break, but this means form submits will silently do nothing until the key is set.

2. **Create Kit custom fields** before going live. Required fields: `bp_score`, `bp_band`, `bp_pattern`, `bp_pattern_secondary`, `bp_breach`, `bp_p1`–`bp_p5`. Create them at: Kit → Subscribers → Custom Fields.

3. **Create Kit tags** and add their IDs to env vars: `break-point-completed`, `bp-runner`, `bp-fixer`, `bp-fader`, `bp-fighter`.

4. **Build Kit automation** triggered by `break-point-completed` tag. Email #1 of that sequence is the "full report" — it should use custom fields like `{{ subscriber.bp_score }}`, `{{ subscriber.bp_band }}`, `{{ subscriber.bp_pattern }}`, etc.

5. **Replace `TODO_BOOKING_URL`** in `/break-point/book/index.html` with the actual Calendly / TidyCal / Stripe link.

6. **Replace `TODO_VINCERE_SOCIETY_URL`** with the Skool community link.

7. **Paste booking embed** into `.booking-embed-container` in `/break-point/book/index.html`.

8. **Replace `TODO_OG_IMAGE_URL`** on all three pages with a real Open Graph image (1200×630).

9. **Fix Vincere Society redirect loop.** The www ↔ non-www redirect loop on vinceresociety.com must be resolved in Netlify (force www or non-www canonically) before linking to it from this funnel.

---

## QA Notes

- Debug mode available on results page: `?debug=SCORE,LETTER` — e.g. `?debug=150,A` forces STRUCTURAL LOAD + RUNNER pattern. Remove or restrict to a secret param before indexing in production (currently noindex so fine for now).
- The progress bar starts at 0% on hero, advances to `(partNum-1)/7 * 100%` per part. Part 7 completion navigates away so bar never reaches 100% — this is correct.
- Cinnabar `#C84B1D` does not appear anywhere in this build. Grep confirmed before commit.
- `#9C948A` secondary text: used at 13px+ throughout. Lighthouse accessibility check should be run; this color at 13px may approach the threshold. If flagged, bump to `#A8A09A` or increase minimum size to 14px.

---

## What the Next Build Should Know

- The Kit v4 API endpoint for subscriber creation is `POST /v4/subscribers` (not `/v3/subscribers`). The auth header is `Bearer {API_KEY}`, not the v3 `api_key` query param.
- Kit v4 custom field values must be strings, not numbers.
- The tagging endpoint is `POST /v4/tags/{tagId}/subscribers` with body `{ subscriber_id }`.
- Netlify Functions must use ES module `export const handler` syntax (not CommonJS `exports.handler`) when the functions directory is configured in `netlify.toml`.

# Open items

State as of 11 Sep 2026, after the intake pipeline went live. Everything here is
deliberately unfinished — none of it blocks leads being captured.

The pipeline itself is done: site → Cloudflare relay → Airtable `Intake`, with
error detection, a retry queue, spam guards and an AI summary. See `README.md`
for how it works and why.

---

## Needs a decision

### Internal notification — deferred on purpose

The brief calls for emailing Tay and the concierge when a lead lands. **Not
built, deliberately.** Tay's inbox is already unread and overrun, so an alert
there would train her to ignore the one signal that means someone is waiting.

The plan is to revisit when the concierge owns triage — a notification is only
useful when it reaches someone whose job is to act on it.

Options already considered and why they were set aside:

- **Slack** — rejected, no appetite for another app.
- **WhatsApp** — where Tay actually talks to clients, but there is no native
  Airtable action, so it means the Meta Cloud API. Two blockers: a phone number
  can be on the WhatsApp Business *app* or the Cloud API but **not both**, so
  moving her business number would take away the app she uses with clients; and
  business-initiated messages need pre-approved templates. Revisit alongside SMS
  rather than bolting an alert onto a channel that isn't ready. Verify Meta's
  current rules before committing.
- **Have the lead text Tay directly** — promising, and it inverts the problem:
  the lead becomes the notification, in the channel she lives in, with no
  automation to maintain. Parked until it can be done properly. If built, keep
  the form submission as well or the record, summary and queue are all lost for
  that path. Needs the real business number — the footer currently shows
  `(703) 555-0145` with an **empty `tel:` href**, which looks like placeholder
  copy.

**Residual risk while there is no notification:** the site promises a reply
within fifteen minutes. That promise is currently backed only by someone
remembering to open the `✨ New Lead` view, which sorts oldest-first.

### Welcome email — tabled

Tabled pending decisions about how automations and the AI summary fit together.
Now unblocked technically: it sends to `Email Address`, which the form finally
collects.

Three things to resolve before rebuilding it against `Intake`:

1. **It fires on only 3 of 11 support types** — `Birth & Labor Doula Support`,
   `Bereavement Support`, `Fertility & Reproductive Care`. Of the five site
   paths, only `Pregnant` matches. Postpartum, Childcare, General support and
   Text us leads would receive nothing.
2. **The copy only describes the package path** — call → proposal → service
   agreement → deposit → meet & greet. A childcare or "just need to talk" lead
   being told they are about to sign a service agreement is the "reads as
   careless" problem the brief warns about.
3. **The formatting may be broken in what people actually receive.** The body
   mixes Markdown (`**bold**`, `>` quotes, `[text](url)`) with HTML `<br>`.
   Gmail renders HTML, not Markdown. **Check a real inbox** — if it is broken it
   has been broken for every lead who ever got it.

The original copy is preserved at the bottom of this file, because the old
automation is due to be archived.

### `Status` options are probably over-specified

`Intake.Status` mirrors all 18 options from the old `Leads` table, per the
brief. But HoneyBook owns the pipeline after handoff, so Airtable only needs the
pre-handoff stages — roughly: new lead → needs a reply → handed over → closed.

Trimming is fiddly once real records use the options, so it is cheaper to decide
while everything in the table is a test record.

### 42-day cancellation sweep — probably obsolete

The old automation swept `Proposal Sent` / `Contract Sent` → `Cancelled` at 42
days. Those are exactly the stages HoneyBook now owns, so records may never sit
in them. Worth deciding it is dead rather than leaving it on a list.

---

## Housekeeping

- **20 test records in `Intake`**, all `Status: New Lead`. The `✨ New Lead`
  view is standing in for a notification and sorts oldest-first, so a real lead
  would appear *below* twenty fakes. Clear them or set them to `No Hire` before
  anything real arrives.
- **Old `Leads` table** — decommission plan unwritten and the Typeform sunset
  date unset. Both still live.
- **Old contact list** — 500–600 doula inquiries with unverified consent. The
  brief is explicit: confirm what they opted into before any email marketing.
  Spam complaints damage sending reputation on a domain also used for client
  mail.

---

## Domain migration (momager.co / themomagerco.com)

Planned for when the site moves off `momager.lbm.systems`. Two things in the
repo reference the domain; everything else is documentation.

**Order matters.** Add the new origins to `ALLOWED_ORIGINS` in
`workers/intake-relay.js` and deploy **before** changing DNS. The Worker can
allow all domains at once, so there is never a window where the form 403s.
Doing it the other way round means submissions fail until the Worker catches up
— they would be queued and retried, but retried into the same 403 forever.

**Don't break the email.** `themomagerco.com` already carries mail
(`hello@themomagerco.com`, and the Gmail integration the welcome email sends
through). If its DNS moves to Cloudflare, carry the **MX and SPF/DKIM/TXT
records across unchanged**. Repointing nameservers without them kills inbound
mail silently.

Also:

- GitHub Pages allows **one** custom domain, so pick a canonical and 301 the
  others. Cloudflare Redirect Rules do this for free.
- Apex domains need A records to GitHub's Pages IPs, or Cloudflare CNAME
  flattening. Check GitHub's current docs for the IPs rather than trusting a
  remembered list.
- Set the DNS record **DNS-only** until GitHub issues its certificate; proxying
  too early can break provisioning. Then Full (strict) if you want the proxy.

---

## Gotchas worth not rediscovering

- **Hard-refresh after every merge.** `index.html` is ~7 MB and caches hard;
  a normal reload will keep serving the old build. This already caused one round
  of "the change didn't deploy" confusion.
- **Airtable automation changes need a human.** Editing a running automation
  saves a draft; someone must click **Update** in the UI to apply it.
- **Views cannot be created via API.** Airtable exposes no view-creation
  endpoint — they have to be made by hand in the UI.
- **Adding a payload field needs the webhook schema re-captured.** The
  automation can only map keys it has seen, so POST a sample containing the new
  key, re-capture, then add the mapping.

---

## Appendix: the original welcome email

Captured verbatim from the `New Birth Lead Email` automation on the old `Leads`
table, before it is archived. Do not rewrite this copy without Neico and Tay.

**Subject:** `💛 Welcome to The Momager Co: Begin Your Parent Support Journey!`
**From name:** `The Momager Co.`
**To:** the record's `Email Address`
**Trigger:** support type is any of `Birth & Labor Doula Support`,
`Bereavement Support`, `Fertility & Reproductive Care` **and** Status is
`New Lead`

```
Hi {First Name},<br>

Thank you for your interest in The Momager Co's Parenting Support Services. I'm
Niko Hart, and I handle Client Care & Relations for The Momager Co. Our Founder,
Taja Iglesias, also welcomes you!<br>

**Here's What's Next**<br>

>1. Schedule a Call: If not done already, [Use this link](https://calendly.com/d/ypx-qhp-jd3/free-client-consultation)
to schedule your initial phone call with us. It's an opportunity for us to
connect, answer questions and craft your care. <br>

>2. Review & Sign: After our call, expect to receive a Proposal with pricing and
general terms based on your preferences. Later, a Service Agreement will be sent
for you to review with your family and sign to establish care. Some services may
require a deposit.<br>

>3. Meet Your Momager: Once the Service Agreement is signed, we'll host a virtual
meet & greet with you and your potential Momager Match. This personalized session
is an ideal time to ask questions, discuss logistics, preferences, and any
specific details you'd like to share before care begins.<br>

We're thrilled to accompany you on this parenting journey. If you have any
questions or need further assistance, feel free to reply to this email. <br>

Warmly,
Niko, Taja and The Momager Co Team!
```

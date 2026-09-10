# momager.lbm.systems

Static single-page site for The Momager Co., served from GitHub Pages.

## How the build works

`index.html` is **generated** — don't edit it by hand.

It is a self-unpacking bundle: a small loader, plus a base64+gzip asset manifest
(fonts, images, React, ReactDOM, Babel standalone) and a JSON-encoded copy of the
real document. The application itself is one asset in that manifest, compiled in
the browser by Babel.

The editable source is **`src/app.jsx`**. After changing it:

```sh
python3 build.py           # rewrite index.html from src/app.jsx
python3 build.py --check   # verify index.html matches src/app.jsx
```

`build.py` swaps only the application asset and leaves every other byte of the
bundle untouched, verifying the round-trip before it writes.

## Intake submissions

The questionnaire posts to the Cloudflare Worker in `workers/`, which forwards
to the Airtable automation webhook. Configured in one place at the top of
`src/app.jsx`:

```js
const INTAKE_ENDPOINT = "https://momager-intake-relay.learnbuildmaintain.workers.dev/";
const INTAKE_OPAQUE  = false;
```

No Airtable token is used or stored anywhere — not in the site, not in the
Worker. Both only ever talk to the write-only webhook URL.

### Why the body is form-encoded

The endpoint accepts **only** `application/json` or
`application/x-www-form-urlencoded`, and rejects anything else with
`BAD_REQUEST` before the automation trigger ever fires.

Of those two, only form encoding is on the CORS safelist. `application/json`
would force a preflight, and the endpoint sends no CORS headers, so the
preflight fails and the real request is never sent. That means the payload
goes as `URLSearchParams` — which sets the right content type automatically.
Setting the header by hand would be stripped under `no-cors`.

Everything arrives as a string, including `smsConsent=true`; Airtable coerces
it into the checkbox correctly.

### Why the relay exists

Airtable's webhook sends no CORS headers, so a browser can post to it but can
never read the reply. Every failure then looks exactly like success. That is
not theoretical: a content-type rejection silently dropped two live
submissions, and the site showed those leads a success screen.

Posting through the Worker instead means real status codes come back. A
rejected payload is a rejection, an unreachable upstream is a 502, and the
retry queue can be trusted — so `INTAKE_OPAQUE` is `false`.

Leave `INTAKE_OPAQUE` as `true` only for an endpoint that sends no CORS
headers at all, where `mode: "no-cors"` is the lesser evil: it at least stops
the browser reporting delivered requests as failures, which would re-queue
already-created records and duplicate them on every page load.

The Worker holds no secrets and is origin-locked to momager.lbm.systems. That
lock stops casual browser abuse but is not a security boundary — any
non-browser client can spoof `Origin`. Worst case is junk rows in `Intake`,
never data exposure. **If the site is ever served from another domain, add it
to `ALLOWED_ORIGINS` in the Worker or submissions will 403.**

Submissions land in the `Intake` table of the `Leads` base
(`appYE8hEfQpGoQw1g` / `tbl2ZLBS5Ln3QaW4T`). Behaviour worth knowing:

- **All five entry points share one submit path.** The four questionnaire paths,
  plus the "Text us" shortcut (header, hero link, one-time band, sticky bar),
  which skips the questions and writes `Path: Text us`.
- **A failed post is never lost.** The payload is parked in `localStorage` and
  retried on the next page load; the lead always sees the success screen.
- **Spam:** an off-canvas honeypot field and a 2-second minimum time-to-submit.
  Both drop the submission silently and still show the success screen.
- **Phone numbers** are normalised to E.164 before sending, with an inline
  error for anything that isn't 10 or 11 digits.

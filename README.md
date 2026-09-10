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

The questionnaire posts to an Airtable automation webhook, configured in one
place at the top of `src/app.jsx`:

```js
const INTAKE_ENDPOINT = "https://hooks.airtable.com/workflows/v1/genericWebhook/...";
const INTAKE_OPAQUE  = true;
```

Swapping transports (Zapier catch hook, Cloudflare Worker proxy) is a two-line
change there. No Airtable token is used or stored client-side — the webhook URL
is write-only into the automation.

### Why `INTAKE_OPAQUE`

Airtable's webhook endpoint sends no CORS headers. A normal cross-origin
`fetch` to it still **delivers** the POST — the browser only refuses to let
JavaScript read the reply, surfacing as `TypeError: Failed to fetch`.

Treating that as a failure is actively harmful here: the retry queue would
re-send a record that was already created, duplicating it on every subsequent
page load, forever. `mode: "no-cors"` makes the request resolve instead, so a
rejection once again means only one thing — the request never left the device,
which is the case the queue exists for.

The trade-off is that server-side errors are invisible; an opaque response
reports `status 0` whether the endpoint returned 200 or 500. If delivery
confirmation is needed, move to a transport that sends CORS headers (Zapier
catch hook or a Cloudflare Worker) and set `INTAKE_OPAQUE = false`.

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

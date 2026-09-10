/**
 * Intake relay — Cloudflare Worker
 *
 * Sits between momager.lbm.systems and the Airtable automation webhook.
 *
 * It exists for one reason: Airtable's webhook sends no CORS headers, so a
 * browser can post to it but can never read the reply. That makes every
 * failure look identical to success, which is how a content-type rejection
 * once silently dropped live leads. This relay answers with CORS headers, so
 * the site can tell delivered from failed and the retry queue means something.
 *
 * It also converts the form-encoded body the browser must send (the only
 * accepted content type on the CORS safelist) into the JSON Airtable wants.
 *
 * No Airtable token is involved. This forwards to the same write-only webhook
 * URL the site used directly, so there is nothing secret in here.
 */

const AIRTABLE_WEBHOOK =
  "https://hooks.airtable.com/workflows/v1/genericWebhook/appYE8hEfQpGoQw1g/wflcIHEDo24Z7aRuq/wtrnH7kUuVyGY6xEc";

const ALLOWED_ORIGINS = new Set([
  "https://momager.lbm.systems",
  "http://localhost:8899",
  "http://127.0.0.1:8899",
]);

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: Object.assign(
      { "Content-Type": "application/json" },
      origin ? corsHeaders(origin) : {}
    ),
  });
}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";
    const allowed = ALLOWED_ORIGINS.has(origin);

    // Preflight. Only needed if the site ever sends application/json; a
    // form-encoded body is a simple request and skips this entirely.
    if (request.method === "OPTIONS") {
      return allowed
        ? new Response(null, { status: 204, headers: corsHeaders(origin) })
        : new Response(null, { status: 403 });
    }

    if (request.method !== "POST") {
      return json({ error: "method not allowed" }, 405, allowed ? origin : null);
    }

    // Origin locking keeps casual browser abuse out. It is not a security
    // boundary — any non-browser client can send whatever Origin it likes —
    // but the worst case is junk rows in Intake, never data exposure.
    if (!allowed) {
      return json({ error: "origin not allowed" }, 403, null);
    }

    let payload;
    const contentType = request.headers.get("Content-Type") || "";
    try {
      if (contentType.includes("application/json")) {
        payload = await request.json();
      } else {
        const form = await request.formData();
        payload = Object.fromEntries(form);
      }
    } catch (err) {
      return json({ error: "unparseable body" }, 400, origin);
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return json({ error: "payload must be an object" }, 400, origin);
    }

    // A form body makes everything a string; the webhook schema expects a
    // boolean here.
    if (typeof payload.smsConsent === "string") {
      payload.smsConsent = payload.smsConsent === "true";
    }

    let upstream;
    try {
      upstream = await fetch(AIRTABLE_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      // Upstream unreachable. Report it honestly so the site queues a retry
      // rather than showing a success it cannot vouch for.
      return json({ error: "upstream unreachable" }, 502, origin);
    }

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: Object.assign(
        { "Content-Type": "application/json" },
        corsHeaders(origin)
      ),
    });
  },
};

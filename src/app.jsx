/* global React, ReactDOM */
const { useState, useEffect, useRef, useMemo } = React;

/* ============= INTAKE SUBMISSION ============= */

// Single point of configuration. Swapping transports (Airtable webhook ->
// Zapier catch hook -> Cloudflare Worker) is a two-line change here.
const INTAKE_ENDPOINT = "https://hooks.airtable.com/workflows/v1/genericWebhook/appYE8hEfQpGoQw1g/wflcIHEDo24Z7aRuq/wtrnH7kUuVyGY6xEc";

// The Airtable webhook sends no CORS headers. Without no-cors the browser
// still DELIVERS the POST but reports it to us as a failure, which would
// re-queue an already-created record and duplicate it on every page load.
// Set this false when moving to a transport that does send CORS headers, to
// get real delivery confirmation back.
const INTAKE_OPAQUE = true;

// Path id -> the values written to Airtable. `supportType` is load-bearing:
// the welcome-email automation keys off it, so no path may leave it blank.
// `__text` covers the text-us shortcut, which skips the questionnaire.
const PATH_META = {
  pregnant:   { path: "Pregnant",        supportType: "Birth & Labor Doula Support" },
  postpartum: { path: "Postpartum",      supportType: "Postpartum Doula Support" },
  childcare:  { path: "Childcare",       supportType: "Child & Infant Care Support" },
  questions:  { path: "General support", supportType: "One-Time Support Session" },
  __text:     { path: "Text us",         supportType: "General Inquiry" },
};

const RETRY_KEY = "momager-intake-retry";
const MIN_SUBMIT_MS = 2000; // anything faster than this is a bot, not a person

// E.164 for SMS downstream. US country code assumed when there's no + prefix.
function toE164(raw) {
  const trimmed = String(raw || "").trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.charAt(0) === "+") {
    return digits.length >= 8 && digits.length <= 15 ? "+" + digits : null;
  }
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.charAt(0) === "1") return "+" + digits;
  return null;
}

// Read by a human and by an AI summarizer, so: legible prose, one
// "Question: Answer" per line, in the order the lead saw them.
function formatAnswers(answers) {
  return answers.map((a) => a.q + ": " + a.a).join("\n");
}

function readRetryQueue() {
  try {
    const raw = window.localStorage.getItem(RETRY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
}

function writeRetryQueue(queue) {
  try {
    window.localStorage.setItem(RETRY_KEY, JSON.stringify(queue.slice(-20)));
  } catch (err) {
    // private mode, quota, blocked storage - nothing useful to do here
  }
}

async function postIntake(payload) {
  // text/plain keeps this a CORS "simple request" so no preflight is needed;
  // the receiving end parses the body as JSON regardless of declared type.
  const opts = {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify(payload),
  };
  if (INTAKE_OPAQUE) opts.mode = "no-cors";

  const res = await fetch(INTAKE_ENDPOINT, opts);

  // An opaque response reports status 0 / ok false even when the POST
  // succeeded, so the only meaningful signal is that fetch resolved at all.
  // A rejection means the request never left the device - which is exactly
  // the case the retry queue exists for.
  if (res.type !== "opaque" && !res.ok) {
    throw new Error("intake endpoint returned " + res.status);
  }
  return res;
}

// Never lose a lead to a failed network call. On failure the payload is
// parked in localStorage and retried on the next page load; the caller
// still shows the success screen either way.
async function submitIntake(payload) {
  try {
    await postIntake(payload);
    return true;
  } catch (err) {
    console.error("[intake] submit failed, queued for retry:", err, payload);
    writeRetryQueue(readRetryQueue().concat([payload]));
    return false;
  }
}

async function flushRetryQueue() {
  const queue = readRetryQueue();
  if (!queue.length) return;
  const remaining = [];
  for (const payload of queue) {
    try {
      await postIntake(payload);
    } catch (err) {
      console.error("[intake] retry failed, still queued:", err);
      remaining.push(payload);
    }
  }
  writeRetryQueue(remaining);
}

/* ============= ICONS ============= */
const Icon = {
  arrow: (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12h14M13 5l7 7-7 7"/></svg>,
  back: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M19 12H5M12 19l-7-7 7-7"/></svg>,
  check: (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="20 6 9 17 4 12"/></svg>,
  star: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  text: (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>,
  send: (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  plus: (p) => <span {...p}>+</span>,
  minus: (p) => <span {...p}>–</span>,
};

/* ============= HEADER ============= */
function Header({ onText }) {
  return (
    <header className="hdr">
      <div className="hdr-inner">
        <a href="#" className="logo-img"><img src={window.LOGO_URL || "logo.webp"} alt="The Momager Co."/></a>
        <nav className="hdr-nav">
          <a href="#how">How it works</a>
          <a href="#services">Services</a>
          <a href="#stories">Stories</a>
        </nav>
        <button className="hdr-cta" onClick={onText}><Icon.text/> Text us</button>
      </div>
    </header>
  );
}

/* ============= HERO (path picker IS the hero) ============= */
const PATHS = [
  { id: "pregnant", title: "I'm pregnant", sub: "Holding the unknown of what's ahead" },
  { id: "postpartum", title: "I just had a baby", sub: "In the thick of recovery" },
  { id: "childcare", title: "I'm looking for childcare", sub: "I need someone we trust at home" },
  { id: "questions", title: "I just need support", sub: "Not sure what I need yet, just know I need someone" },
];

function Hero({ onPath, onText }) {
  return (
    <section className="hero" data-screen-label="Hero">
      <span className="hero-eyebrow"><span className="eb-dot"/> Serving Northern Virginia</span>
      <div className="hero-grid">
        <div>
          <h1 className="display hero-headline">The Momager Co. is <em className="script" style={{fontStyle:"normal"}}>Parenthood, Managed.</em></h1>
          <p className="lede hero-lede">Personalized, full-spectrum doula support, so you're never figuring out what's best for you, alone.</p>

          <div className="paths-block">
            <div className="paths-head">
              <h3>Tell us where you are in your journey.</h3>
              <span className="script-sub">pick one →</span>
            </div>
            <div className="paths">
              {PATHS.map((p) => (
                <button key={p.id} className="path" onClick={() => onPath(p.id)}>
                  <span className="path-text">
                    <strong>{p.title}</strong>
                    <span>{p.sub}</span>
                  </span>
                  <span className="path-arrow"><Icon.arrow/></span>
                </button>
              ))}
            </div>
            <div className="path-foot">
              <span>Want to skip the form?</span>
              <a href="#" onClick={(e) => { e.preventDefault(); onText(); }}>Just text us instead →</a>
            </div>
          </div>
        </div>

        <div className="hero-video">
          <div className="hero-video-placeholder">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor"/></svg>
            <span className="hero-video-label">Client interview · coming soon</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============= HOW IT WORKS ============= */
function HowItWorks() {
  const steps = [
    { n: "01", t: "You text us, or take the 60-second intake", d: "Tell us where you are. Pregnant, postpartum, looking for childcare, or just need to talk." },
    { n: "02", t: "We send a tailored proposal", d: "Within the day. Real prices, real availability. You'll know exactly what you're getting." },
    { n: "03", t: "Consult and book", d: "We meet, we plan, you decide what fits. From there, your Momager is one text away." },
  ];
  return (
    <section id="how" className="section" data-screen-label="How it works">
      <div className="section-h">
        <div>
          <span className="section-tag">three steps</span>
          <h2 className="display-2">How it works.</h2>
        </div>
      </div>
      <div className="how-grid">
        {steps.map((s) => (
          <div key={s.n} className="how-step">
            <span className="how-num">{s.n}</span>
            <h3>{s.t}</h3>
            <p>{s.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============= SERVICES ============= */
const SERVICES = [
  {
    id: "pregnant", title: "Birth Doula Support", price: "From $2,800",
    desc: "Hands-on, intuitive care through pregnancy, labor, and the first hours after.",
    bullets: ["Birth planning sessions", "Labor support (in person or virtual)", "Partner coaching", "Post-birth grounding"],
  },
  {
    id: "postpartum", title: "Postpartum Support", price: "From $95/hr",
    desc: "Recovery, feeding, sleep, and emotional check-ins for the fourth trimester.",
    bullets: ["Newborn care guidance", "Feeding support", "Routine development", "Emotional check-ins"],
  },
  {
    id: "childcare", title: "Childcare / Nanny", price: "From $35/hr · No agency fees",
    desc: "Qualified caregivers providing in-home care for your little one.",
    bullets: ["Personalized placement", "Background-checked", "Cultural alignment", "Ongoing support"],
  },
  {
    id: "questions", title: "Momager Text Support", price: "$300/month",
    desc: "You don't always need the full experience. Sometimes you just need to text a Momager to get you through the questions, the spirals, and everything in between.",
    bullets: ["Unlimited texting, Mon–Fri", "Two scheduled calls each month", "Hospital prep & labor check-ins", "Full access to Tay's Substack"],
  },
];

function Services({ onPath }) {
  return (
    <section id="services" className="section" data-screen-label="Services">
      <div className="section-h">
        <div>
          <span className="section-tag">our services</span>
          <h2 className="display-2">Choose the support you need<br/><em className="script" style={{fontStyle:"normal", color:"inherit"}}>or text us. We'll figure it out, together.</em></h2>
        </div>
      </div>
      <div className="svc-grid">
        {SERVICES.map((s) => (
          <article key={s.id} className={"svc" + (s.featured ? " is-featured" : "")}>
            <div className="svc-top">
              <h3>{s.title}</h3>
              <span className="svc-price-tag">{s.price}</span>
            </div>
            <p className="svc-desc">{s.desc}</p>
            <ul className="svc-list">
              {s.bullets.map((b) => <li key={b}><Icon.check/> {b}</li>)}
            </ul>
            <button className="svc-cta" onClick={() => onPath(s.id)}>Start here <Icon.arrow/></button>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ============= MEET THE TEAM (one-time band, redesigned) ============= */
function OneTime({ onPath, onText }) {
  return (
    <section className="onetime" data-screen-label="One-time support">
      <div className="onetime-grid">
        <div className="onetime-left">
          <span className="section-tag" style={{color: "var(--clay)"}}>need help today?</span>
          <h2 className="display-2">One hour. <em className="script" style={{fontStyle:"normal"}}>$100.</em> A real Momager.</h2>
          <p>Same-day availability for birth questions, postpartum spirals, feeding panic, or just a sounding board. No package required.</p>
          <div className="onetime-ctas">
            <button className="btn btn-primary" onClick={() => onPath("questions")}>Book a session <Icon.arrow/></button>
            <button className="btn btn-ghost" onClick={onText}>Or just text us</button>
          </div>
        </div>
        <div>
          <div className="team">
            {[
              { name: "Tay", role: "founder", img: window.TAY_IMG || "tay.png" },
              { name: "Jessica", role: "doula", img: window.JESSICA_IMG || "jessica.png", zoom: 1.2 },
              { name: "Sienna", role: "birth worker", img: window.SIENNA_IMG || "sienna.jpg" },
              { name: "Audrey", role: "postpartum", c1: "#D4A574", c2: "#5C4033" },
            ].map((p) => (
              <div key={p.name} className="team-card" style={p.img ? {backgroundImage: `url(${p.img})`, backgroundSize: p.zoom ? `${p.zoom * 100}%` : "cover", backgroundPosition: p.zoom ? "left bottom" : "center"} : {background: `linear-gradient(135deg, ${p.c1}, ${p.c2})`}}>
                <div className="team-name"><span>{p.name}</span><em>{p.role}</em></div>
              </div>
            ))}
          </div>
          <p className="team-caption">The Momagers — birth workers, doulas, & the people you'll actually be texting.</p>
        </div>
      </div>
    </section>
  );
}

/* ============= ASK MOMAGER ============= */
function AskMomager() {
  const [thread, setThread] = useState([
    { from: "ai", text: "Hi love. I'm Ask Momager — a digital doula trained on Tay's voice and our care library. What's on your mind tonight?" },
  ]);
  const [val, setVal] = useState("");
  const [loading, setLoading] = useState(false);
  const threadRef = useRef(null);

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [thread, loading]);

  async function send(text) {
    const t = (text ?? val).trim();
    if (!t || loading) return;
    setVal("");
    setThread((th) => [...th, { from: "you", text: t }]);
    setLoading(true);
    try {
      const reply = await window.claude.complete({
        messages: [{
          role: "user",
          content: `You are "Ask Momager," a warm, calm, knowledgeable digital doula trained on the voice of Tay (founder of The Momager Co.). Reply briefly (1-3 short sentences), in plain conversational text, the way a trusted friend who's a birth worker would. No markdown, no lists, no headers. End by checking in or asking what would help. The user just said: "${t}"`
        }],
      });
      setThread((th) => [...th, { from: "ai", text: reply.trim() }]);
    } catch (e) {
      setThread((th) => [...th, { from: "ai", text: "I'm here. Tell me a little more about what's going on?" }]);
    }
    setLoading(false);
  }

  const prompts = ["Is this normal at 36 weeks?", "Baby won't latch — help", "I'm exhausted and crying"];

  return (
    <section className="section" data-screen-label="Ask Momager">
      <div className="ask-grid">
        <div className="ask-left">
          <span className="section-tag">24/7 · digital doula</span>
          <h2 className="display-2">Ask Momager. <em className="script" style={{fontStyle:"normal"}}>Any hour. Any question.</em></h2>
          <p className="lede">Trained on our care library and the way Tay actually talks. For 3 a.m. questions you don't want to wake anyone for.</p>
          <div className="ask-prompts">
            {prompts.map((p) => <button key={p} className="chip" onClick={() => send(p)}>{p}</button>)}
          </div>
          <p className="ask-fine">Not a substitute for emergency medical care.</p>
        </div>
        <div className="phone">
          <div className="phone-top">
            <span className="phone-dot"/> Ask Momager <span className="phone-status">online</span>
          </div>
          <div className="phone-thread" ref={threadRef}>
            {thread.map((m, i) => (
              <div key={i} className={"bubble " + (m.from === "ai" ? "bubble-ai" : "bubble-you")}>{m.text}</div>
            ))}
            {loading && <div className="bubble bubble-ai bubble-typing"><span/><span/><span/></div>}
          </div>
          <form className="phone-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="Type a message…"/>
            <button type="submit" disabled={!val.trim() || loading}><Icon.send/></button>
          </form>
        </div>
      </div>
    </section>
  );
}

/* ============= STORIES ============= */
function Stories() {
  const stories = [
    { q: "Taja is the best doula I have ever encountered. Her ability to balance a calm, grounding presence with assertive advocacy when needed was remarkable. She was born for this work.", a: "Nichelle G." },
    { q: "Working with Taja is a dream — organized, dependable, knowledgeable, and also loving and authentic. From labor to 12 weeks of postpartum to childcare for our baby & toddler, we've always felt so well cared for.", a: "Carly M." },
    { q: "Taja really came through for us when we were in a pinch. My toddler can be slow to warm up to people and she took to Taja immediately! There aren't a lot of services like this in the area you can book to be on call for your older children when you go into labor. Momager is the best!", a: "Eric & Brittany P." },
    { q: "I was a month postpartum with a low milk supply. With just one call, Tay guided me through a few strategies that helped in a significant way. Thanks to her help, I was able to nurse until 5–6 months — my ultimate goal. I was about to give up when we connected.", a: "Anabelle R." },
    { q: "Tay was so knowledgeable when it came to breastfeeding. She gave great tips and we were able to fix my daughter's latch right away!", a: "Kaschell H." },
  ];
  const [idx, setIdx] = useState(0);
  const trackRef = useRef(null);
  const go = (i) => {
    const n = (i + stories.length) % stories.length;
    setIdx(n);
    if (trackRef.current) {
      const card = trackRef.current.children[n];
      if (card) trackRef.current.scrollTo({ left: card.offsetLeft - trackRef.current.offsetLeft, behavior: "smooth" });
    }
  };
  return (
    <section id="stories" className="section" data-screen-label="Stories">
      <div className="section-h">
        <div>
          <h2 className="display-2">From the families we've supported</h2>
        </div>
      </div>
      <div className="story-carousel">
        <button className="carousel-side is-prev" onClick={() => go(idx - 1)} aria-label="Previous"><Icon.back/></button>
        <div className="story-track" ref={trackRef}
          onScroll={(e) => {
            const t = e.currentTarget;
            const w = t.children[0]?.offsetWidth || 1;
            const i = Math.round(t.scrollLeft / (w + 16));
            if (i !== idx) setIdx(i);
          }}>
          {stories.map((s, i) => (
            <figure key={i} className="story">
              <div className="story-stars"><Icon.star/><Icon.star/><Icon.star/><Icon.star/><Icon.star/></div>
              <blockquote>"{s.q}"</blockquote>
              <figcaption>— {s.a}</figcaption>
            </figure>
          ))}
        </div>
        <button className="carousel-side is-next" onClick={() => go(idx + 1)} aria-label="Next"><Icon.arrow/></button>
        <div className="carousel-controls">
          <div className="carousel-dots">
            {stories.slice(0, -1).map((_, i) => (
              <button key={i} className={"dot" + (i === idx ? " is-on" : "")} onClick={() => go(i)} aria-label={`Story ${i+1}`}/>
            ))}
          </div>
        </div>
      </div>
      <div className="stories-more">
        <div className="trust trust-stories">
          <span className="trust-sub"><strong>5.0</strong> · 200+ families supported across the DMV</span>
        </div>
        <a href="https://www.google.com/search?q=The+Momager+Co+reviews" target="_blank" rel="noopener noreferrer">Read all reviews on Google →</a>
      </div>
    </section>
  );
}

/* ============= FAQ ============= */
function FAQ() {
  const items = [
    { q: "Is texting really how this works?", a: "Yes. Most of our day-to-day is SMS. It's the lowest-friction way to get a real answer when you're holding a baby with one hand." },
    { q: "Do you do in-person births in Northern Virginia?", a: "Yes — Arlington, Alexandria, DC, and most of the DMV. We also support virtual births anywhere in the US." },
    { q: "Can I book just one session without committing to a package?", a: "Yes. One-time sessions are $100/hr with same-day availability when we have it." },
    { q: "What does a Momager actually do?", a: "We blend traditional doula care with the systems most parents are missing: birth plans, postpartum logistics, sleep and feeding support, childcare placement, and a calm voice in your texts when you need one." },
    { q: "Are your caregivers vetted?", a: "Background-checked, reference-checked, and personally interviewed by us. We only place caregivers we'd hand our own kids to." },
  ];
  const [open, setOpen] = useState(0);
  return (
    <section className="section faq" data-screen-label="FAQ">
      <div className="section-h">
        <div>
          <span className="section-tag">Frequently Asked Questions</span>
          <h2 className="display-2">There's simple answers.</h2>
        </div>
      </div>
      <div className="faq-list">
        {items.map((it, i) => (
          <div key={i} className={"faq-item" + (open === i ? " is-open" : "")}>
            <button className="faq-q" onClick={() => setOpen(open === i ? -1 : i)}>
              <span>{it.q}</span>
              <span className="faq-toggle">{open === i ? "–" : "+"}</span>
            </button>
            <div className="faq-a"><p>{it.a}</p></div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============= TAY LETTER (delayed modal) ============= */
function LetterModal() {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem("letter-dismissed")) {
      setDismissed(true);
      return;
    }
    const onScroll = () => {
      if (window.scrollY > window.innerHeight * 0.5) {
        setOpen(true);
        window.removeEventListener("scroll", onScroll);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const close = () => {
    setOpen(false);
    setDismissed(true);
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem("letter-dismissed", "1");
  };

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (dismissed || !open) return null;

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="A note from Tay">
      <div className="modal-back" onClick={close}/>
      <div className="modal-card letter-modal-card">
        <div className="modal-top">
          <button className="modal-back-btn" onClick={close}>close</button>
          <span className="modal-step">a note from Tay</span>
        </div>
        <div className="modal-body">
          <section className="letter letter-inside-modal" data-screen-label="Letter from Tay">
            <span className="letter-tag">a note from Tay</span>
            <div className="letter-body">
              <p>For the past five years, I've served families across the DMV as a full spectrum doula. That work has naturally led me into midwifery studies, deepening the way I show up and care for the families who trust me.</p>
              <p>In that time, I've supported single mothers by choice, nonbinary couples, and families navigating overwhelming decisions. I've been present in delivery rooms where steady guidance helped avoid unnecessary intervention, and I've labored alongside some of the strongest, most intuitive beings I've ever encountered.</p>
              <p>Each experience has shaped the way I practice. It has taught me that care cannot be rigid or one dimensional. It has to be responsive, informed, and rooted in trust. It has to meet people where they are, not where systems expect them to be.</p>
              <p>To choose The Momager Co. is to choose thoughtful, high-quality care that prepares you for birth well before it begins. Through intentional prenatal support, steady guidance, and real options that help your life and environment run smoothly, you are supported in a way that goes far beyond the surface-level. I serve you as an individual, not just a name on an invoice. This work is deeply personal to me, and I carry it with the intention of caring for you while contributing to a stronger, more supported birthworking community.</p>
            </div>
            <div className="letter-sig">— Tay</div>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ============= FOOTER ============= */
function Footer() {
  return (
    <footer className="ftr" data-screen-label="Footer">
      <div className="ftr-inner">
        <div className="ftr-brand">
          <img src={window.LOGO_URL || "logo.webp"} alt="The Momager Co."/>
          <p>Delivering parenthood. Premium parent support across Northern Virginia & the greater DMV.</p>
        </div>
        <div className="ftr-cols">
          <div>
            <h5>Services</h5>
            <a href="#">Birth Doula</a>
            <a href="#">Postpartum</a>
            <a href="#">Childcare / Nanny</a>
            <a href="#">One-Time Support</a>
          </div>
          <div>
            <h5>Company</h5>
            <a href="#">How it works</a>
            <a href="#">Stories</a>
            <a href="#">Approved Doula Directory</a>
            <a href="#">Journal</a>
          </div>
          <div>
            <h5>Contact</h5>
            <a href="tel:">(703) 555-0145</a>
            <a href="mailto:hello@themomagerco.com">hello@themomagerco.com</a>
            <a href="#">Instagram</a>
            <a href="#">TikTok</a>
          </div>
        </div>
      </div>
      <div className="ftr-base">
        <span>© 2026 The Momager Co.</span>
        <span className="script">Parenthood, Managed.</span>
      </div>
    </footer>
  );
}

/* ============= STICKY MOBILE BAR ============= */
function StickyBar({ onText, onIntake }) {
  return (
    <div className="sticky">
      <button className="sticky-cta" onClick={onText}>
        <Icon.text/>
        <div><strong>Text us</strong><em>reply in ~15 min</em></div>
      </button>
      <button className="sticky-alt" onClick={onIntake}>60-sec intake</button>
    </div>
  );
}

/* ============= INTAKE WIZARD ============= */
const QUIZ = {
  pregnant: [
    { q: "How far along are you?", tag: "let's start here", opts: ["First trimester", "Second trimester", "Third trimester", "Past my due date"] },
    { q: "What kind of birth are you planning?", tag: "tell me more", opts: ["Hospital", "Birth center", "Home birth", "Still deciding"] },
    { q: "What feels heaviest right now?", tag: "honestly", opts: ["Birth prep + planning", "Partner is overwhelmed", "I'm scared of the hospital", "Just want a person on call"] },
  ],
  postpartum: [
    { q: "How old is baby?", tag: "where are we", opts: ["Less than a week", "1–4 weeks", "1–3 months", "Older than 3 months"] },
    { q: "What's hardest right now?", tag: "what's up", opts: ["Feeding", "Sleep", "Healing", "All of it"] },
    { q: "Do you have help at home?", tag: "and you", opts: ["Partner — but they go back to work soon", "Family for a bit", "Mostly alone", "I'd rather not say"] },
  ],
  childcare: [
    { q: "When do you need care?", tag: "let's plan", opts: ["ASAP", "In the next month", "1–3 months", "Just exploring"] },
    { q: "How many kids?", tag: "got it", opts: ["One", "Two", "Three or more", "One on the way"] },
    { q: "What's most important?", tag: "what matters", opts: ["Cultural alignment", "Schedule flexibility", "Newborn experience", "Long-term fit"] },
  ],
  questions: [
    { q: "What's on your mind?", tag: "tell me", opts: ["Pregnancy question", "Postpartum question", "Childcare question", "Just need to talk"] },
    { q: "How urgent does this feel?", tag: "be real", opts: ["Right now", "This week", "Soon-ish", "Not urgent"] },
  ],
};
const RESULTS = {
  pregnant: { title: "Birth Doula Support", lead: "We'll be in your corner from prep through delivery.", price: "From $2,800" },
  postpartum: { title: "Postpartum Support", lead: "Recovery, feeding, sleep — held by someone who's been there.", price: "From $95/hr" },
  childcare: { title: "In-Home Childcare", lead: "Qualified caregivers providing in-home care for your little one. No agency fees.", price: "From $35/hr" },
  questions: { title: "One-Time Support Session", lead: "60 minutes with a Momager. Phone, text, or in person when we can.", price: "$100 / hour" },
};

function Intake({ open, path, onClose, mode }) {
  // mode: "quiz" | "text"
  const [step, setStep] = useState(0);
  const [picks, setPicks] = useState([]);
  const [done, setDone] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const openedAt = useRef(0);
  const questions = path && QUIZ[path] ? QUIZ[path] : [];

  useEffect(() => {
    if (open) {
      setStep(0); setPicks([]); setDone(false); setSubmitted(false);
      openedAt.current = Date.now();
    }
  }, [open, path, mode]);

  // Only the steps the lead actually answered, in the order they saw them.
  const answers = picks
    .map((choice, i) => (questions[i] ? { q: questions[i].q, a: questions[i].opts[choice] } : null))
    .filter(Boolean);

  if (!open) return null;

  // text-us shortcut: jump straight to a contact form
  const isText = mode === "text" || !path;

  const handlePick = (i) => {
    const next = [...picks, i];
    setPicks(next);
    if (step + 1 < questions.length) setStep(step + 1);
    else setDone(true); // show result step next
  };

  const stepIndex = isText ? 0 : (done ? questions.length : step);
  const stepTotal = isText ? 1 : questions.length + 1;
  const progress = isText ? 50 : ((stepIndex + (submitted ? 1 : 0)) / stepTotal) * 100;

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal-back" onClick={onClose}/>
      <div className="modal-card">
        <div className="modal-top">
          {(step > 0 && !done && !isText)
            ? <button className="modal-back-btn" onClick={() => { setStep(step-1); setPicks(picks.slice(0,-1)); }}><Icon.back/> back</button>
            : <button className="modal-back-btn" onClick={onClose}>close</button>}
          <span className="modal-step">{isText ? "" : (done ? "step " + (questions.length + 1) + " of " + (questions.length+1) : "step " + (step+1) + " of " + (questions.length+1))}</span>
        </div>
        <div className="progress"><span style={{width: progress + "%"}}/></div>
        <div className="modal-body">
          {submitted ? (
            <SubmittedView/>
          ) : isText ? (
            <ContactStep onSubmit={() => setSubmitted(true)} textMode path={null} answers={[]} recommendation={null} openedAt={openedAt.current}/>
          ) : !done ? (
            <QuizStep step={questions[step]} onPick={handlePick}/>
          ) : (
            <ResultStep path={path} onSubmit={() => setSubmitted(true)} answers={answers} openedAt={openedAt.current}/>
          )}
        </div>
      </div>
    </div>
  );
}

function QuizStep({ step, onPick }) {
  return (
    <div className="qbox">
      <span className="script-tag">{step.tag}</span>
      <h3>{step.q}</h3>
      <div className="opts">
        {step.opts.map((o, i) => (
          <button key={o} className="opt" onClick={() => onPick(i)}>
            <span>{o}</span>
            <span className="opt-check"><Icon.check/></span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultStep({ path, onSubmit, answers, openedAt }) {
  const r = RESULTS[path];
  return (
    <div className="qbox">
      <span className="script-tag">recommended for you</span>
      <h3>{r.title}</h3>
      <p className="qsub">{r.lead}</p>
      <div className="match-card">
        <div className="match-head">
          <strong>{r.title}</strong>
          <span className="script">{r.price}</span>
        </div>
        <ul className="match-list">
          <li><Icon.check/> Real human in your texts within 15 min</li>
          <li><Icon.check/> Tailored proposal within the day</li>
          <li><Icon.check/> Consult before you commit</li>
        </ul>
      </div>
      <ContactStep onSubmit={onSubmit} path={path} answers={answers} recommendation={r} openedAt={openedAt}/>
    </div>
  );
}

function ContactStep({ onSubmit, textMode, path, answers, recommendation, openedAt }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [trap, setTrap] = useState(""); // honeypot - real users never fill this
  const [phoneError, setPhoneError] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (sending) return;

    // Honeypot filled, or submitted faster than a person can read the form.
    // Show the success screen anyway so a bot can't tell it was dropped.
    if (trap.trim() || Date.now() - openedAt < MIN_SUBMIT_MS) {
      onSubmit();
      return;
    }

    const e164 = toE164(phone);
    if (!e164) {
      setPhoneError("Please enter a 10-digit US mobile number, e.g. (703) 555-0401.");
      return;
    }
    setPhoneError("");
    setSending(true);

    const meta = PATH_META[path] || PATH_META.__text;
    await submitIntake({
      firstName: name.trim(),
      phone: e164,
      email: "",
      path: meta.path,
      supportType: meta.supportType,
      inTheirWords: note.trim(),
      questionnaireAnswers: formatAnswers(answers || []),
      answersRaw: JSON.stringify(answers || []),
      recommendedService: recommendation ? recommendation.title : "",
      priceShown: recommendation ? recommendation.price : "",
      smsConsent: true,
      sourceUrl: window.location.href,
    });

    // submitIntake never throws - a failed post is queued for retry - so the
    // lead never sees an error state for an infrastructure problem.
    setSending(false);
    onSubmit();
  }

  return (
    <div className="qbox" style={{marginTop: textMode ? 0 : 16}}>
      {textMode && <>
        <span className="script-tag">almost there</span>
        <h3>Where should we text you?</h3>
        <p className="qsub">Someone from our team will reply within 15 minutes during the day.</p>
      </>}
      <form className="form" onSubmit={handleSubmit}>
        <label>First name <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="e.g. Maya" required/></label>
        <label>Mobile number <input value={phone} onChange={(e)=>{setPhone(e.target.value); if (phoneError) setPhoneError("");}} type="tel" placeholder="(703) 555-0401" required/></label>
        {phoneError && <p role="alert" style={{color:"#c0392b", fontSize:13, lineHeight:1.4, marginTop:-4}}>{phoneError}</p>}
        <label>Tell us about you and how we can help<textarea rows="3" value={note} onChange={(e)=>setNote(e.target.value)} placeholder="The more detailed the better." required/></label>
        <div aria-hidden="true" style={{position:"absolute", left:"-9999px", width:1, height:1, overflow:"hidden"}}>
          <label>Company
            <input type="text" tabIndex="-1" autoComplete="off" value={trap} onChange={(e)=>setTrap(e.target.value)}/>
          </label>
        </div>
        <button className="btn btn-dark btn-full btn-lg" type="submit" disabled={sending}>Connect with Momager <Icon.arrow/></button>
        <p className="finep">By submitting, you agree to receive SMS from The Momager Co. Reply STOP to unsubscribe. Standard rates apply.</p>
      </form>
    </div>
  );
}

function SubmittedView() {
  return (
    <div className="qbox" style={{textAlign: "center", padding: "20px 0"}}>
      <h3 style={{maxWidth: "22ch", margin: "8px auto 18px"}}>Your Momager will be in touch shortly.</h3>
      <p className="qsub" style={{maxWidth: "36ch", margin: "0 auto"}}>First message will just be a hello so you know the number's us.</p>
    </div>
  );
}

/* ============= APP ============= */
function App() {
  const [intake, setIntake] = useState({ open: false, path: null, mode: null });
  const openPath = (p) => setIntake({ open: true, path: p, mode: "quiz" });
  const openText = () => setIntake({ open: true, path: null, mode: "text" });
  const closeIntake = () => setIntake({ open: false, path: null, mode: null });

  // Retry any submissions parked by an earlier failed network call.
  useEffect(() => { flushRetryQueue(); }, []);

  // lock scroll when modal open
  useEffect(() => {
    document.body.style.overflow = intake.open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [intake.open]);

  return (
    <>
      <div className="grain"/>
      <Header onText={openText}/>
      <Hero onPath={openPath} onText={openText}/>
      <div className="paper-zone"><HowItWorks/></div>
      <Services onPath={openPath}/>
      <OneTime onPath={openPath} onText={openText}/>
      <div className="paper-zone"><Stories/></div>
      <FAQ/>
      <Footer/>
      <LetterModal/>
      <StickyBar onText={openText} onIntake={() => openPath("pregnant")}/>
      <Intake open={intake.open} path={intake.path} mode={intake.mode} onClose={closeIntake}/>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);

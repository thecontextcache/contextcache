import Link from "next/link";

// Never statically cache — the middleware must run on every request
// so authenticated users are redirected to /app before this renders.
export const dynamic = "force-dynamic";

const FEATURES = [
  {
    icon: "🧠",
    title: "Project Brain",
    desc: "Every project gets its own memory layer. Decisions, findings, definitions — all organised, all searchable.",
    tag: "core.memory",
    color: "#00D4FF",
  },
  {
    icon: "⚡",
    title: "Instant Recall",
    desc: "Postgres FTS ranking returns the most relevant memories in milliseconds. Recency fallback when no FTS match.",
    tag: "engine.recall",
    color: "#7C3AFF",
  },
  {
    icon: "📋",
    title: "Paste-ready Packs",
    desc: "One click copies a formatted memory pack, grouped by type — ready to paste into any LLM context window.",
    tag: "output.pack",
    color: "#00E5A0",
  },
  {
    icon: "🔑",
    title: "API Key Access",
    desc: "Programmatic access for agents, scripts, and CI pipelines. Keys are hashed at rest, org-scoped, and revokable.",
    tag: "auth.api_key",
    color: "#FFB800",
  },
  {
    icon: "🔒",
    title: "Session Auth",
    desc: "Magic-link sign-in with secure HttpOnly session cookies. Invite-only — no public registration.",
    tag: "auth.session",
    color: "#00D4FF",
  },
  {
    icon: "🐳",
    title: "Self-hosted",
    desc: "One docker compose up and everything runs — API, DB, UI, docs. No external services required to start.",
    tag: "infra.compose",
    color: "#7C3AFF",
  },
];

const MEMORY_TYPES = [
  { label: "decision",   color: "#00D4FF" },
  { label: "finding",    color: "#7C3AFF" },
  { label: "definition", color: "#00E5A0" },
  { label: "note",       color: "#FFB800" },
  { label: "link",       color: "#FF3B6E" },
  { label: "todo",       color: "#A78BFA" },
];

const STEPS = [
  {
    num: "01",
    title: "Capture a memory",
    desc: "Tag any decision, finding, or note inside your project. 10 seconds to publish.",
  },
  {
    num: "02",
    title: "Recall by keyword",
    desc: "Query the project brain. FTS ranking surfaces the most relevant memories first.",
  },
  {
    num: "03",
    title: "Paste into any LLM",
    desc: "Copy the formatted memory pack. Paste into ChatGPT, Claude, or any AI tool.",
  },
];

const TECH = [
  { label: "fastapi",    color: "#00E5A0" },
  { label: "postgres",   color: "#00D4FF" },
  { label: "next.js",    color: "#ffffff" },
  { label: "sqlalchemy", color: "#FFB800" },
  { label: "alembic",    color: "#7C3AFF" },
  { label: "docker",     color: "#00D4FF" },
];

export default function LandingPage() {
  return (
    <>
      {/* ══ HERO ══════════════════════════════════════════════════════════════ */}
      <section className="l-hero">
        {/* Background grid */}
        <div className="l-grid-bg" />

        {/* Glow blobs */}
        <div
          className="l-glow-blob"
          style={{
            width: 600, height: 600,
            background: "radial-gradient(circle, rgba(0,212,255,0.14) 0%, transparent 70%)",
            top: "-10%", left: "60%",
          }}
        />
        <div
          className="l-glow-blob"
          style={{
            width: 500, height: 500,
            background: "radial-gradient(circle, rgba(124,58,255,0.12) 0%, transparent 70%)",
            top: "30%", left: "-10%",
            animationDelay: "3s",
          }}
        />

        {/* Badge */}
        <div className="l-badge">
          <span className="l-badge-dot" />
          Invite-only alpha — now live
        </div>

        {/* Headline */}
        <h1 className="l-title">
          <span className="l-title-grad">TheContextCache</span>
          <br />
          <span className="l-title-white" style={{ fontSize: "0.55em", letterSpacing: "0.02em", opacity: 0.9 }}>
            Project Brain for AI Teams
          </span>
        </h1>

        {/* Tagline */}
        <p className="l-tagline">
          Capture high-signal decisions and findings. Recall a formatted, paste-ready
          memory pack — in milliseconds — right when your LLM needs them.
        </p>

        {/* CTAs */}
        <div className="l-actions">
          <Link href="/waitlist" className="btn-glow">
            Join the waitlist →
          </Link>
          <Link href="/auth" className="btn-outline-glow">
            Sign in
          </Link>
        </div>

        {/* Scroll hint */}
        <div className="l-scroll-hint">
          <div className="l-scroll-line" />
          scroll
        </div>
      </section>

      {/* ══ TECH STRIP ════════════════════════════════════════════════════════ */}
      <div className="l-tech-strip">
        <div className="l-tech-inner">
          <span className="l-tech-label">Built on</span>
          {TECH.map((t) => (
            <span key={t.label} className="tech-chip">
              <span
                className="tech-chip-dot"
                style={{ background: t.color, boxShadow: `0 0 6px ${t.color}` }}
              />
              {t.label}
            </span>
          ))}
        </div>
      </div>

      {/* ══ HOW IT WORKS ══════════════════════════════════════════════════════ */}
      <div className="l-section">
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <p className="l-section-label">How it works</p>
          <h2 className="l-section-title">Three steps. Zero friction.</h2>
          <p className="l-section-sub" style={{ margin: "0 auto" }}>
            From a raw observation to paste-ready AI context in under a minute.
          </p>
        </div>
        <div className="l-steps">
          {STEPS.map((s) => (
            <div key={s.num} className="l-step">
              <div className="l-step-num">{s.num}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ══ TERMINAL DEMO ═════════════════════════════════════════════════════ */}
      <div className="l-section" style={{ paddingTop: 0 }}>
        <div className="l-terminal">
          <div className="l-terminal-bar">
            <span className="l-terminal-dot" style={{ background: "#FF3B6E" }} />
            <span className="l-terminal-dot" style={{ background: "#FFB800" }} />
            <span className="l-terminal-dot" style={{ background: "#00E5A0" }} />
            <span style={{ marginLeft: 8, fontSize: "0.72rem", color: "#4A6685", fontFamily: "var(--mono)" }}>
              contextcache — recall
            </span>
          </div>
          <div className="l-terminal-body">
            <div><span className="dim">$</span> curl -s https://thecontextcache.com<span className="dim">/api</span>/projects/1/recall<span className="dim">?query=</span><span className="ok">auth+model</span> \</div>
            <div style={{ paddingLeft: 12 }}><span className="dim">-H</span> <span className="violet">"X-API-Key: cck_your_key"</span></div>
            <div className="dim" style={{ marginTop: 8 }}>{"{"}</div>
            <div style={{ paddingLeft: 16 }}><span className="dim">"project_id":</span> 1,</div>
            <div style={{ paddingLeft: 16 }}><span className="dim">"query":</span> <span className="ok">"auth model"</span>,</div>
            <div style={{ paddingLeft: 16 }}><span className="dim">"memory_pack_text":</span> <span className="ok">"## Decisions\n..."</span>,</div>
            <div style={{ paddingLeft: 16 }}><span className="dim">"items":</span> [</div>
            <div style={{ paddingLeft: 32 }}><span className="dim">{"{"}</span> <span className="violet">"type"</span><span className="dim">:</span> <span className="ok">"decision"</span><span className="dim">,</span> <span className="violet">"rank_score"</span><span className="dim">:</span> <span style={{ color: "#FFB800" }}>0.842</span> <span className="dim">{"}"}</span></div>
            <div style={{ paddingLeft: 16 }}>]</div>
            <div className="dim">{"}"}</div>
            <div style={{ marginTop: 8 }}><span className="muted-t">$</span> <span className="l-terminal-cursor" /></div>
          </div>
        </div>
      </div>

      {/* ══ FEATURES ══════════════════════════════════════════════════════════ */}
      <div className="l-section" style={{ paddingTop: 0 }}>
        <div style={{ marginBottom: 40 }}>
          <p className="l-section-label">Capabilities</p>
          <h2 className="l-section-title">Everything your AI context needs</h2>
          <p className="l-section-sub">
            Designed for the way teams actually use LLMs — not how they should in theory.
          </p>
        </div>
        <div className="l-features-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="l-feature-card">
              <div
                className="l-feature-icon"
                style={{
                  background: `${f.color}12`,
                  borderColor: `${f.color}30`,
                }}
              >
                {f.icon}
              </div>
              <div className="l-feature-title">{f.title}</div>
              <p className="l-feature-desc">{f.desc}</p>
              <span className="l-feature-tag">{f.tag}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ══ MEMORY TYPES ══════════════════════════════════════════════════════ */}
      <div className="l-section" style={{ paddingTop: 0, textAlign: "center" }}>
        <p className="l-section-label">Memory types</p>
        <h2 className="l-section-title" style={{ marginBottom: 10 }}>
          Six types. One searchable brain.
        </h2>
        <p
          className="l-section-sub"
          style={{ margin: "0 auto 36px", textAlign: "center" }}
        >
          Tag every memory with the right type. Recall groups them automatically.
        </p>
        <div className="l-types-grid">
          {MEMORY_TYPES.map((t) => (
            <div key={t.label} className="l-type-pill">
              <span
                className="l-type-dot"
                style={{
                  background: t.color,
                  boxShadow: `0 0 6px ${t.color}`,
                }}
              />
              {t.label}
            </div>
          ))}
        </div>
      </div>

      {/* ══ STATS ═════════════════════════════════════════════════════════════ */}
      <div className="l-section" style={{ paddingTop: 0 }}>
        <div className="l-stats">
          {[
            { value: "<10ms", label: "Recall latency" },
            { value: "6",     label: "Memory types" },
            { value: "100%",  label: "Self-hosted" },
            { value: "0",     label: "External deps" },
          ].map((s) => (
            <div key={s.label} className="l-stat">
              <div className="l-stat-value">{s.value}</div>
              <div className="l-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ FINAL CTA ═════════════════════════════════════════════════════════ */}
      <div className="l-section" style={{ paddingTop: 0 }}>
        <div className="l-cta-box">
          <div className="l-grid-bg" style={{ opacity: 0.5 }} />
          <div className="l-cta-glow" />
          <p
            className="l-section-label"
            style={{ textAlign: "center", marginBottom: 14, position: "relative", zIndex: 1 }}
          >
            Ready to start
          </p>
          <h2>Give your AI team a memory.</h2>
          <p>
            Request your invitation to the alpha. We onboard in small batches to maintain quality.
          </p>
          <div className="l-cta-actions">
            <Link href="/waitlist" className="btn-glow">
              Join the waitlist →
            </Link>
            <Link href="/auth" className="btn-outline-glow">
              Sign in
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom spacer */}
      <div style={{ height: 40 }} />
    </>
  );
}

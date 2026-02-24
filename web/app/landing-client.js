"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import BrainGraph from "./components/BrainGraph";

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
  { label: "decision", color: "#00D4FF" },
  { label: "finding", color: "#7C3AFF" },
  { label: "definition", color: "#00E5A0" },
  { label: "note", color: "#FFB800" },
  { label: "link", color: "#FF3B6E" },
  { label: "todo", color: "#A78BFA" },
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
  { label: "fastapi", color: "#00E5A0" },
  { label: "postgres", color: "#00D4FF" },
  { label: "next.js", color: "#ffffff" },
  { label: "sqlalchemy", color: "#FFB800" },
  { label: "alembic", color: "#7C3AFF" },
  { label: "docker", color: "#00D4FF" },
];

const LIVE_BRAIN_PROJECTS = [
  { id: 1, name: "Platform Core", created_at: "2026-02-20T00:00:00Z" },
  { id: 2, name: "Growth Loops", created_at: "2026-02-20T00:00:00Z" },
];

const LIVE_BRAIN_MEMORIES = {
  1: [
    { id: 101, type: "decision", title: "Use Postgres + FTS", content: "Core retrieval baseline", created_at: "2026-02-19T10:00:00Z" },
    { id: 102, type: "finding", title: "Hybrid beats overlap", content: "FTS + vector + recency", created_at: "2026-02-19T10:10:00Z" },
    { id: 103, type: "definition", title: "Memory pack", content: "Paste-ready grouped output", created_at: "2026-02-19T10:20:00Z" },
    { id: 104, type: "todo", title: "CocoIndex ingest", content: "Incremental ETL pipeline", created_at: "2026-02-19T10:30:00Z" },
    { id: 105, type: "code", title: "Recall endpoint", content: "Hybrid scoring path", created_at: "2026-02-19T10:40:00Z" },
    { id: 106, type: "doc", title: "API contract", content: "Public docs + examples", created_at: "2026-02-19T10:50:00Z" },
    { id: 107, type: "note", title: "Rate limits", content: "Daily/weekly enforcement", created_at: "2026-02-19T11:00:00Z" },
    { id: 108, type: "link", title: "Deployment playbook", content: "Cloudflare tunnel mode", created_at: "2026-02-19T11:10:00Z" },
  ],
  2: [
    { id: 201, type: "decision", title: "Invite-only beta", content: "Controlled onboarding", created_at: "2026-02-19T12:00:00Z" },
    { id: 202, type: "finding", title: "Waitlist conversion", content: "Top traffic sources", created_at: "2026-02-19T12:10:00Z" },
    { id: 203, type: "definition", title: "Qualified team", content: "Usage + retention signal", created_at: "2026-02-19T12:20:00Z" },
    { id: 204, type: "todo", title: "CLI expansion", content: "Admin/integration commands", created_at: "2026-02-19T12:30:00Z" },
    { id: 205, type: "code", title: "SDK release", content: "SemVer 0.2.0 prep", created_at: "2026-02-19T12:40:00Z" },
    { id: 206, type: "doc", title: "Pricing tiers", content: "Alpha/Pro/Team/Enterprise", created_at: "2026-02-19T12:50:00Z" },
    { id: 207, type: "note", title: "Landing tests", content: "Theme + accessibility polish", created_at: "2026-02-19T13:00:00Z" },
    { id: 208, type: "link", title: "Community", content: "Waitlist and docs funnel", created_at: "2026-02-19T13:10:00Z" },
  ],
};

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`l-faq-item${open ? " open" : ""}`}>
      <button
        className="l-faq-q"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{q}</span>
        <span className="l-faq-chevron" aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="l-faq-a">{a}</div>}
    </div>
  );
}

export default function LandingPage() {

  // "Steve Jobs" style premium startup chime (synthetic)
  const playStartupSound = useCallback(() => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();

      // Deep, resonant sci-fi chord (C minor 9th-ish)
      const playOsc = (freq, type, detune, duration, vol) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        osc.detune.value = detune;

        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(vol, now + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.start(now);
        osc.stop(now + duration);
      };

      // The sweeping chord: Low C, G, Eb, High D
      playOsc(65.41, "sine", 0, 3.5, 0.4);   // Sub bass
      playOsc(98.00, "sine", 5, 4.0, 0.2);   // G
      playOsc(155.56, "triangle", 0, 3.0, 0.15); // Eb
      playOsc(293.66, "sine", -5, 4.5, 0.1); // High D
    } catch (e) {
      console.warn("AudioContext not supported or blocked");
    }
  }, []);

  return (
    <>
      {/* ══ HERO ══════════════════════════════════════════════════════════════ */}
      <section className="l-hero">
        {/* Background grid */}
        <div className="l-grid-bg" />

        {/* Glow blobs with Parallax */}
        <div
          className="l-glow-blob"
          style={{
            width: 600, height: 600,
            background: "radial-gradient(circle, rgba(0,212,255,0.14) 0%, transparent 70%)",
            top: "-10%", left: "60%"
          }}
        />
        <div
          className="l-glow-blob"
          style={{
            width: 500, height: 500,
            background: "radial-gradient(circle, rgba(124,58,255,0.12) 0%, transparent 70%)",
            top: "30%", left: "-10%",
            animationDelay: "3s"
          }}
        />

        {/* Badge */}
        <div
          className="l-badge animate-fade-in"
          style={{ animationDelay: "0.1s" }}
        >
          <span className="l-badge-dot" />
          Invite-only alpha — now live
        </div>

        {/* Headline */}
        <h1
          className="l-title animate-fade-in"
          style={{ animationDelay: "0.2s" }}
        >
          <span className="l-title-grad">TheContextCache</span>
          <br />
          <span className="l-title-white" style={{ fontSize: "0.55em", letterSpacing: "0.02em", opacity: 0.9 }}>
            Project Brain for AI Teams
          </span>
        </h1>

        {/* Tagline */}
        <p
          className="l-tagline animate-fade-in"
          style={{ animationDelay: "0.35s" }}
        >
          Capture high-signal decisions and findings. Recall a formatted, paste-ready
          memory pack — in milliseconds — right when your LLM needs them.
        </p>

        {/* CTAs */}
        <div
          className="l-actions animate-fade-in"
          style={{ animationDelay: "0.45s" }}
        >
          <Link href="/waitlist" className="btn-glow" onClick={playStartupSound}>
            Join the waitlist →
          </Link>
          <Link href="/auth" className="btn-outline-glow" onClick={playStartupSound}>
            Sign in
          </Link>
        </div>

        {/* Scroll hint */}
        <div
          className="l-scroll-hint animate-fade-in"
          style={{ animationDelay: "1.2s" }}
        >
          <div className="l-scroll-line" />
          scroll
        </div>
      </section>

      {/* ══ LIVE BRAIN PREVIEW ═════════════════════════════════════════════ */}
      <div
        className="l-section animate-fade-in"
        style={{ paddingTop: 0 }}
      >
        <div style={{ marginBottom: 26 }}>
          <p className="l-section-label">Live preview</p>
          <h2 className="l-section-title">Your knowledge as a living neural graph</h2>
          <p className="l-section-sub">
            Capture and recall your project knowledge as a living neural graph.
            The full interactive view includes filtering, highlights, and recall tracebacks.
          </p>
        </div>
        <div style={{ border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden", boxShadow: "var(--shadow)" }}>
          <div style={{ height: 360 }}>
            <BrainGraph
              projects={LIVE_BRAIN_PROJECTS}
              memoriesByProject={LIVE_BRAIN_MEMORIES}
              highlightIds={["101", "201"]}
            />
          </div>
        </div>
        <div className="l-actions" style={{ justifyContent: "flex-start", marginTop: 18 }}>
          <Link href="/brain" className="btn-outline-glow">Learn more</Link>
          <Link href="/waitlist" className="btn-glow" onClick={playStartupSound}>Join waitlist →</Link>
        </div>
      </div>

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
      <div className="l-section animate-fade-in">
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
      <div
        className="l-section animate-fade-in"
        style={{ paddingTop: 0 }}
      >
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

      <div
        className="l-section animate-fade-in"
        style={{ paddingTop: 0 }}
      >
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
            { value: "6", label: "Memory types" },
            { value: "100%", label: "Self-hosted" },
            { value: "0", label: "External deps" },
          ].map((s) => (
            <div key={s.label} className="l-stat">
              <div className="l-stat-value">{s.value}</div>
              <div className="l-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ TRUST STRIP ═══════════════════════════════════════════════════════ */}
      <div className="l-section" style={{ paddingTop: 0 }}>
        <div className="l-trust-strip">
          {[
            { icon: "🏠", label: "Self-hosted", desc: "Runs entirely on your infrastructure. No SaaS lock-in." },
            { icon: "🔒", label: "No telemetry", desc: "Zero data sent to third parties. We never see your memories." },
            { icon: "🛡", label: "Invite-only alpha", desc: "Hand-picked users. We onboard carefully to maintain quality." },
            { icon: "🗝", label: "API key + session", desc: "Two auth methods. Keys are hashed at rest, sessions are HttpOnly." },
            { icon: "🧹", label: "Auto-purge", desc: "Login IPs capped at 10 per user. Usage rows purged after 90 days." },
            { icon: "📄", label: "Proprietary license", desc: "Source visible but not open source. Your IP stays yours." },
          ].map(({ icon, label, desc }) => (
            <div key={label} className="l-trust-item">
              <span className="l-trust-icon">{icon}</span>
              <div>
                <div className="l-trust-label">{label}</div>
                <div className="l-trust-desc">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ FAQ ═══════════════════════════════════════════════════════════════ */}
      <div className="l-section" style={{ paddingTop: 0 }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <p className="l-section-label">FAQ</p>
          <h2 className="l-section-title">Common questions</h2>
        </div>
        <div className="l-faq">
          {[
            {
              q: "What is thecontextcache™?",
              a: "A project memory layer for AI teams. You capture decisions, findings, and notes; we return a formatted memory pack when your LLM needs context. Think of it as a persistent, searchable brain for every project.",
            },
            {
              q: "Who is this for?",
              a: "Engineers and teams who use LLMs daily — writing code, debugging, or making architectural decisions. If you've ever re-explained the same context to ChatGPT twice, this is for you.",
            },
            {
              q: "Is my data private?",
              a: "Yes. The app is self-hosted: everything runs in your Docker environment. We never see your projects or memories. Login IPs are stored temporarily (last 10 per user, purged after 90 days).",
            },
            {
              q: "What's the difference between Alpha and the upcoming Pro plan?",
              a: "Alpha is free and invite-only, giving you full access to shape the product. Pro (coming after LLC formation) will add team seats, higher limits, webhooks, and SLA support. Alpha users will receive a discount.",
            },
            {
              q: "How does recall work?",
              a: "We use Postgres full-text search (FTS) with rank scoring and a recency fallback. Results are grouped by memory type and returned as a paste-ready pack. Vector embeddings via pgvector are planned for a future release.",
            },
            {
              q: "Can I use the CLI or API directly?",
              a: "Yes. Every endpoint is available via REST API. A Python CLI (cc) and SDK are included. Authenticate with an API key for programmatic access from scripts, CI, or agents.",
            },
            {
              q: "Is the source code open source?",
              a: "No. The code is source-visible but proprietary — you can inspect it, self-host it under the alpha license, but you cannot redistribute or build commercial products with it. See the Legal page.",
            },
          ].map(({ q, a }) => (
            <FaqItem key={q} q={q} a={a} />
          ))}
        </div>
      </div>

      {/* ══ FINAL CTA ═════════════════════════════════════════════════════════ */}
      <div
        className="l-section animate-fade-in"
        style={{ paddingTop: 0 }}
      >
        <div className="l-cta-box">
          <div className="l-grid-bg" style={{ opacity: 0.5 }} />
          <div className="l-cta-glow" />
          <div
            className="l-badge"
            style={{ position: "relative", zIndex: 1, marginBottom: 20, display: "inline-flex" }}
          >
            <span className="l-badge-dot" />
            Now accepting alpha applications
          </div>
          <h2>Give your AI team a memory.</h2>
          <p>
            Request your invitation. We onboard in small batches — direct founder support, full feature
            access, and a seat at the table while we shape the product.
          </p>
          <div className="l-cta-actions" style={{ justifyContent: "center" }}>
            <Link href="/waitlist" className="btn-glow" style={{ fontSize: "1rem", padding: "14px 36px" }} onClick={playStartupSound}>
              Join the waitlist →
            </Link>
            <Link href="/auth" className="btn-outline-glow" onClick={playStartupSound}>
              Already invited? Sign in
            </Link>
          </div>
          <p style={{
            position: "relative", zIndex: 1,
            fontSize: "0.75rem", color: "rgba(100,140,180,0.5)",
            marginTop: 20, textAlign: "center",
          }}>
            No credit card · Self-hosted · Your data stays yours
          </p>
        </div>
      </div>

      {/* Bottom spacer */}
      <div style={{ height: 40 }} />
    </>
  );
}

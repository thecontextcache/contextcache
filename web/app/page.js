import Link from "next/link";

export default function LandingPage() {
  return (
    <main>
      {/* Hero */}
      <section className="hero">
        <p className="alpha-banner">
          <span>★</span> Invite-only alpha
        </p>
        <h1>TheContextCache™</h1>
        <p className="hero-tagline">
          The shared memory layer for AI-assisted teams. Capture high-signal decisions,
          then recall paste-ready context packs — right when your LLM needs them.
        </p>
        <div className="hero-actions">
          <Link href="/auth" className="btn primary lg">
            Request access
          </Link>
          <Link href="/auth" className="btn secondary lg">
            Sign in
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="features-grid">
        <div className="feature-card">
          <div className="feature-icon">🧠</div>
          <h3>Project Brain</h3>
          <p>
            Organise memory cards by project. Decisions, findings, definitions, todos — all
            in one searchable place.
          </p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">⚡</div>
          <h3>Instant Recall</h3>
          <p>
            Full-text search with Postgres FTS ranking. Get ranked results in milliseconds,
            with recency fallback.
          </p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">📋</div>
          <h3>Paste-ready Packs</h3>
          <p>
            One-click copy or download your memory pack as a formatted text block. Paste it
            straight into ChatGPT, Claude, or any LLM.
          </p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">🔑</div>
          <h3>API-key Access</h3>
          <p>
            Programmatic access for scripts, CI workflows, or agent pipelines. Keys are
            hashed at rest, org-scoped, and revokable.
          </p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">🔒</div>
          <h3>Invite-only</h3>
          <p>
            Session-based auth with secure HttpOnly cookies. Alpha access by invitation. No
            public registration.
          </p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">🚀</div>
          <h3>Self-hosted</h3>
          <p>
            Runs as a single <code>docker compose up</code>. Postgres-backed, no external
            services required.
          </p>
        </div>
      </section>

      {/* Trust row */}
      <div className="trust-row">
        <div className="trust-item">
          <span>🔐</span>
          <span>Session cookies — <strong>HttpOnly, Secure</strong></span>
        </div>
        <div className="trust-item">
          <span>🛡</span>
          <span>API keys hashed at rest — <strong>SHA-256</strong></span>
        </div>
        <div className="trust-item">
          <span>🐳</span>
          <span>Fully <strong>Docker-native</strong></span>
        </div>
        <div className="trust-item">
          <span>📖</span>
          <span>
            <strong>Open API</strong> — Swagger at /docs
          </span>
        </div>
      </div>
    </main>
  );
}

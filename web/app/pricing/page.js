"use client";

import Link from "next/link";

export default function PricingPage() {
  const TIERS = [
    {
      id: "alpha",
      name: "Alpha",
      tag: "Current",
      tagColor: "var(--ok)",
      price: "Free",
      priceNote: "Invite-only",
      description:
        "Early access for hand-picked teams helping us shape the product. Full feature set, no credit card.",
      cta: { label: "Request an invite", href: "/auth", style: "glow" },
      comingSoon: false,
      features: [
        "Unlimited projects",
        "Unlimited memory cards",
        "Full-text recall engine",
        "API key access",
        "Magic-link authentication",
        "Paste-ready memory packs",
        "Self-hosted — your data stays yours",
        "Direct founder support",
      ],
      highlight: true,
    },
    {
      id: "pro",
      name: "Pro",
      tag: "Coming soon",
      tagColor: "var(--brand)",
      price: "$29",
      priceNote: "per seat / month",
      description:
        "Everything in Alpha, plus higher limits, team collaboration, and priority support.",
      cta: { label: "Join the waitlist", href: "#waitlist", style: "outline" },
      comingSoon: true,
      features: [
        "Everything in Alpha",
        "Up to 10 projects per org",
        "Webhooks & integrations",
        "Recall history & audit log",
        "Priority email support",
        "Uptime SLA",
        "Custom memory types",
        "Monthly usage reports",
      ],
      highlight: false,
    },
    {
      id: "team",
      name: "Team",
      tag: "Coming soon",
      tagColor: "var(--violet)",
      price: "$79",
      priceNote: "per 5 seats / month",
      description:
        "Collaborative workspaces for engineering and product teams. Shared orgs, RBAC, and SSO.",
      cta: { label: "Join the waitlist", href: "#waitlist", style: "outline" },
      comingSoon: true,
      features: [
        "Everything in Pro",
        "Unlimited projects",
        "Role-based access control",
        "SSO / SAML (coming)",
        "Shared org memory spaces",
        "Admin dashboard & analytics",
        "Team-level usage quotas",
        "Dedicated Slack channel",
      ],
      highlight: false,
    },
    {
      id: "enterprise",
      name: "Enterprise",
      tag: "Contact us",
      tagColor: "var(--muted)",
      price: "Custom",
      priceNote: "volume pricing",
      description:
        "On-premise or cloud deployment, compliance packages, custom integrations, and a dedicated SLA.",
      cta: { label: "Talk to us", href: "mailto:support@thecontextcache.com", style: "ghost" },
      comingSoon: true,
      features: [
        "Everything in Team",
        "On-premise / private cloud",
        "Custom data retention",
        "SOC 2 / GDPR compliance pack",
        "Custom SLA & support hours",
        "Dedicated infrastructure",
        "White-label option",
        "Professional onboarding",
      ],
      highlight: false,
    },
  ];

  const FAQ = [
    {
      q: "When will paid plans launch?",
      a: "We're focused on getting the Alpha right first. Paid plans will roll out to waitlist members before a public launch. Expect mid-2026.",
    },
    {
      q: "Will Alpha users get a discount on paid plans?",
      a: "Yes — Alpha participants will receive priority access and a founding-member discount as a thank-you for shaping the product.",
    },
    {
      q: "What payment methods will you support?",
      a: "We plan to support major credit and debit cards via Stripe. Annual billing with a discount will also be available.",
    },
    {
      q: "Can I self-host instead of paying?",
      a: "TheContextCache is designed to be self-hostable. The core open components will remain available. Paid tiers cover managed hosting, SLAs, and enterprise features.",
    },
    {
      q: "How is data handled for paid plans?",
      a: "Paid plans will offer the same data guarantees as Alpha: we never sell your data, never use your memories to train models, and you can export or delete at any time.",
    },
    {
      q: "Do you offer non-profit or academic pricing?",
      a: "Yes — reach out to support@thecontextcache.com and we'll work something out.",
    },
  ];

  return (
    <>
      {/* ══ HERO ════════════════════════════════════════════════════════════ */}
      <section className="l-hero" style={{ minHeight: "52vh", paddingTop: 70, paddingBottom: 60 }}>
        <div className="l-grid-bg" />
        <div
          className="l-glow-blob"
          style={{
            width: 500, height: 500,
            background: "radial-gradient(circle, rgba(0,212,255,0.12) 0%, transparent 70%)",
            top: "-10%", left: "55%",
          }}
        />
        <div
          className="l-glow-blob"
          style={{
            width: 400, height: 400,
            background: "radial-gradient(circle, rgba(124,58,255,0.1) 0%, transparent 70%)",
            top: "20%", left: "-8%",
            animationDelay: "2s",
          }}
        />

        <div className="l-badge">
          <span className="l-badge-dot" />
          Payment gateway — coming soon
        </div>

        <h1 className="l-title" style={{ fontSize: "clamp(2rem, 5.5vw, 4rem)" }}>
          <span className="l-title-grad">Simple pricing.</span>
          <br />
          <span className="l-title-white" style={{ fontSize: "0.6em" }}>
            No surprises, ever.
          </span>
        </h1>
        <p className="l-tagline" style={{ maxWidth: 480 }}>
          Start free with an Alpha invite. Paid tiers are in the works — join the waitlist
          and lock in a founding-member rate.
        </p>
      </section>

      {/* ══ PRICING CARDS ═══════════════════════════════════════════════════ */}
      <div
        style={{
          maxWidth: 1100, margin: "0 auto",
          padding: "0 20px 80px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 16,
            alignItems: "start",
          }}
        >
          {TIERS.map((t) => (
            <div
              key={t.id}
              style={{
                position: "relative",
                border: t.highlight
                  ? "1px solid rgba(0,212,255,0.45)"
                  : "1px solid var(--line)",
                borderRadius: 14,
                padding: "28px 24px",
                background: t.highlight ? "rgba(0,212,255,0.04)" : "var(--panel)",
                boxShadow: t.highlight
                  ? "0 0 40px rgba(0,212,255,0.1), 0 12px 40px rgba(0,0,0,0.3)"
                  : "var(--shadow)",
                display: "flex",
                flexDirection: "column",
                gap: 20,
                opacity: t.comingSoon ? 0.82 : 1,
              }}
            >
              {/* Popular badge */}
              {t.highlight && (
                <div
                  style={{
                    position: "absolute", top: -12, left: "50%",
                    transform: "translateX(-50%)",
                    background: "linear-gradient(135deg, var(--brand), #00A8CC)",
                    color: "#000D18",
                    fontFamily: "var(--display)",
                    fontSize: "0.62rem", fontWeight: 700,
                    letterSpacing: "0.12em", textTransform: "uppercase",
                    padding: "3px 14px", borderRadius: 999,
                    whiteSpace: "nowrap",
                  }}
                >
                  Current plan
                </div>
              )}

              {/* Header */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span
                    style={{
                      fontFamily: "var(--display)",
                      fontSize: "1rem", fontWeight: 800,
                      color: "var(--ink)", letterSpacing: "0.04em",
                    }}
                  >
                    {t.name}
                  </span>
                  <span
                    style={{
                      fontSize: "0.68rem", fontWeight: 700, padding: "2px 8px",
                      borderRadius: 999, fontFamily: "var(--mono)",
                      background: `${t.tagColor}18`,
                      color: t.tagColor,
                      border: `1px solid ${t.tagColor}40`,
                    }}
                  >
                    {t.tag}
                  </span>
                </div>

                <div style={{ marginBottom: 8 }}>
                  <span
                    style={{
                      fontFamily: "var(--display)",
                      fontSize: "2.4rem", fontWeight: 900,
                      lineHeight: 1,
                      background: t.highlight
                        ? "linear-gradient(135deg, var(--brand), var(--violet))"
                        : "none",
                      WebkitBackgroundClip: t.highlight ? "text" : "unset",
                      WebkitTextFillColor: t.highlight ? "transparent" : "var(--ink)",
                      backgroundClip: t.highlight ? "text" : "unset",
                    }}
                  >
                    {t.price}
                  </span>
                  {t.priceNote && (
                    <span
                      style={{
                        fontSize: "0.78rem", color: "var(--muted)",
                        fontFamily: "var(--mono)", marginLeft: 6,
                      }}
                    >
                      {t.priceNote}
                    </span>
                  )}
                </div>

                <p style={{ fontSize: "0.85rem", color: "var(--ink-2)", lineHeight: 1.6 }}>
                  {t.description}
                </p>
              </div>

              {/* CTA */}
              {t.cta.style === "glow" && (
                <Link href={t.cta.href} className="btn-glow" style={{ width: "100%", justifyContent: "center", fontSize: "0.72rem" }}>
                  {t.cta.label} →
                </Link>
              )}
              {t.cta.style === "outline" && (
                <a href={t.cta.href} className="btn-outline-glow" style={{ width: "100%", justifyContent: "center", fontSize: "0.72rem" }}>
                  {t.cta.label}
                </a>
              )}
              {t.cta.style === "ghost" && (
                <a
                  href={t.cta.href}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: "12px 24px",
                    borderRadius: 7,
                    fontFamily: "var(--display)",
                    fontSize: "0.72rem", fontWeight: 700,
                    letterSpacing: "0.1em", textTransform: "uppercase",
                    border: "1px solid var(--line)",
                    color: "var(--muted)",
                    transition: "all 0.18s ease",
                    textDecoration: "none",
                    width: "100%",
                  }}
                >
                  {t.cta.label}
                </a>
              )}

              {/* Features */}
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 8, padding: 0, margin: 0 }}>
                {t.features.map((f) => (
                  <li
                    key={f}
                    style={{
                      display: "flex", gap: 9, alignItems: "flex-start",
                      fontSize: "0.83rem", color: "var(--ink-2)",
                      lineHeight: 1.5,
                    }}
                  >
                    <span style={{ color: "var(--ok)", flexShrink: 0, marginTop: 1 }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              {t.comingSoon && (
                <div
                  style={{
                    fontSize: "0.74rem", color: "var(--muted)",
                    fontFamily: "var(--mono)",
                    borderTop: "1px solid var(--line)",
                    paddingTop: 12, textAlign: "center",
                  }}
                >
                  Payment gateway coming soon
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Usage limits table ── */}
        <div style={{ marginTop: 64 }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <p className="l-section-label">Limits</p>
            <h2 className="l-section-title" style={{ fontSize: "clamp(1.3rem, 3vw, 2rem)", marginBottom: 8 }}>
              What counts against your quota?
            </h2>
            <p className="l-section-sub" style={{ margin: "0 auto" }}>
              Alpha users run with generous defaults. Paid plans will raise or remove all limits.
            </p>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{
              width: "100%", borderCollapse: "collapse",
              fontSize: "0.87rem", color: "var(--ink-2)",
              minWidth: 520,
            }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--line)" }}>
                  {["Limit", "Alpha (free)", "Pro", "Team", "Enterprise"].map((h) => (
                    <th key={h} style={{
                      padding: "10px 14px", textAlign: "left",
                      color: "var(--ink)", fontWeight: 700,
                      fontSize: "0.8rem", letterSpacing: "0.04em",
                      fontFamily: "var(--display)",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["Memories / day",      "100",          "1 000",      "10 000",     "Custom"],
                  ["Recalls / day",        "50",           "500",        "5 000",      "Custom"],
                  ["Projects / day",       "10",           "100",        "Unlimited",  "Unlimited"],
                  ["Projects total",       "Unlimited",    "Unlimited",  "Unlimited",  "Unlimited"],
                  ["Memory pack size",     "10 000 chars", "50 000",     "100 000",    "Custom"],
                  ["API key access",       "✓",            "✓",          "✓",          "✓"],
                  ["is_unlimited flag",    "Admin-only",   "Per account","Per account","Per account"],
                  ["Data retention",       "Yours",        "Yours",      "Yours",      "Custom SLA"],
                  ["Support",              "Founder direct","Email","Priority email","Dedicated SLA"],
                ].map(([limit, ...vals]) => (
                  <tr key={limit} style={{ borderBottom: "1px solid rgba(0,212,255,0.06)" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap" }}>
                      {limit}
                    </td>
                    {vals.map((v, i) => (
                      <td key={i} style={{
                        padding: "10px 14px",
                        color: v === "✓" ? "var(--ok)" : v === "Unlimited" || v === "Custom" ? "var(--brand)" : "var(--ink-2)",
                        fontFamily: v === "✓" ? undefined : "var(--mono)",
                        fontSize: "0.82rem",
                      }}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{
            fontSize: "0.74rem", color: "var(--muted)",
            fontFamily: "var(--mono)", marginTop: 12,
            textAlign: "center",
          }}>
            * Limits are configured via environment variables (DAILY_MEMORY_LIMIT, DAILY_RECALL_LIMIT,
            DAILY_PROJECT_LIMIT). Admin users can set is_unlimited=true to bypass all counters.
          </p>
        </div>

        {/* ── Waitlist ── */}
        <div id="waitlist" style={{ scrollMarginTop: 80, marginTop: 64 }}>
          <div className="l-cta-box" style={{ padding: "48px 32px" }}>
            <div className="l-grid-bg" style={{ opacity: 0.4 }} />
            <div className="l-cta-glow" style={{ width: 300, height: 300 }} />
            <p
              className="l-section-label"
              style={{ textAlign: "center", marginBottom: 10, position: "relative", zIndex: 1 }}
            >
              Paid tiers launching mid-2026
            </p>
            <h2
              style={{
                fontFamily: "var(--display)",
                fontSize: "clamp(1.4rem, 3vw, 2.2rem)",
                fontWeight: 800, color: "var(--ink)",
                marginBottom: 10, position: "relative", zIndex: 1,
              }}
            >
              Lock in founding-member pricing.
            </h2>
            <p
              style={{
                color: "var(--ink-2)", maxWidth: 400, margin: "0 auto 24px",
                position: "relative", zIndex: 1, textAlign: "center",
              }}
            >
              Alpha participants get first access to paid plans at a permanent discount.
              Grab an Alpha invite now.
            </p>
            <div className="l-cta-actions">
              <Link href="/auth" className="btn-glow">
                Request Alpha access →
              </Link>
              <a
                href="mailto:support@thecontextcache.com?subject=Pricing waitlist"
                className="btn-outline-glow"
              >
                Email us about pricing
              </a>
            </div>
          </div>
        </div>

        {/* ── FAQ ── */}
        <div style={{ marginTop: 72 }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <p className="l-section-label">FAQ</p>
            <h2 className="l-section-title">Common questions</h2>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 16,
            }}
          >
            {FAQ.map((item) => (
              <div
                key={item.q}
                style={{
                  padding: "20px 22px",
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                  background: "var(--panel)",
                  transition: "border-color 0.2s",
                }}
              >
                <p
                  style={{
                    fontFamily: "var(--display)",
                    fontSize: "0.78rem", fontWeight: 700,
                    letterSpacing: "0.03em",
                    color: "var(--ink)", marginBottom: 8,
                  }}
                >
                  {item.q}
                </p>
                <p style={{ fontSize: "0.85rem", color: "var(--ink-2)", lineHeight: 1.65 }}>
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Accuracy disclaimer ── */}
        <div
          style={{
            marginTop: 56,
            padding: "20px 24px",
            border: "1px solid var(--line)",
            borderRadius: 10,
            background: "var(--panel)",
            fontSize: "0.82rem",
            color: "var(--muted)",
            lineHeight: 1.65,
            fontFamily: "var(--mono)",
          }}
        >
          <span style={{ color: "var(--brand)", marginRight: 6 }}>§</span>
          Pricing is indicative and subject to change before general availability. All
          features listed for coming-soon tiers are planned but not guaranteed. For
          binding commitments, contact us directly. Subject to our{" "}
          <Link href="/legal" style={{ color: "var(--brand)" }}>Terms of Service</Link>.
        </div>
      </div>
    </>
  );
}

export const metadata = {
  title: "Legal — TheContextCache™",
  description: "Terms of Service, Privacy Policy, and legal notices for TheContextCache™.",
};

const EFFECTIVE = "18 February 2026";
const COMPANY   = "TheContextCache™";
const EMAIL     = "support@thecontextcache.com";

function Section({ id, num, title, children }) {
  return (
    <section id={id} style={{ marginBottom: 36 }}>
      <h2>
        <span style={{ color: "var(--brand)", fontFamily: "var(--mono)", fontSize: "0.75em", marginRight: 8, opacity: 0.7 }}>§{num}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function LegalPage() {
  return (
    <div className="legal-wrap">
      {/* ── Header ── */}
      <div style={{ marginBottom: 40, paddingBottom: 24, borderBottom: "1px solid var(--line)" }}>
        <p className="label" style={{ marginBottom: 8 }}>Legal · {COMPANY}</p>
        <h1 style={{ fontFamily: "var(--display)", letterSpacing: "-0.01em" }}>
          Terms, Privacy &amp; Notices
        </h1>
        <p className="muted" style={{ marginTop: 6 }}>
          Effective: {EFFECTIVE} &mdash; Invite-only Alpha
        </p>
        <p style={{ marginTop: 14, fontSize: "0.9rem" }}>
          By accessing or using {COMPANY} (&ldquo;the Service&rdquo;), you agree to be bound
          by these Terms. Read them carefully. If you disagree with any part, do not use the Service.
        </p>

        {/* Quick-nav */}
        <nav style={{ marginTop: 20 }} aria-label="Legal sections">
          <p className="label" style={{ marginBottom: 8 }}>Jump to</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              ["#alpha",    "Alpha Notice"],
              ["#license",  "License"],
              ["#memory",   "Memory & Accuracy"],
              ["#data",     "Data & Privacy"],
              ["#ip",       "Intellectual Property"],
              ["#liability","Liability"],
              ["#conduct",  "Acceptable Use"],
              ["#indemnification", "Indemnification"],
              ["#termination",     "Termination"],
              ["#law",      "Governing Law"],
              ["#changes",  "Changes"],
              ["#contact",  "Contact"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                style={{
                  fontSize: "0.78rem", padding: "3px 10px",
                  border: "1px solid var(--line)", borderRadius: 999,
                  color: "var(--muted)", fontFamily: "var(--mono)",
                  transition: "color 0.18s, border-color 0.18s",
                }}
              >
                {label}
              </a>
            ))}
          </div>
        </nav>
      </div>

      {/* ── §1 Alpha / Pre-release Notice ── */}
      <Section id="alpha" num="1" title="Alpha &amp; Pre-Release Notice">
        <div
          className="alert warn"
          style={{ marginBottom: 14 }}
          role="note"
        >
          <span>⚠</span>
          <span>
            {COMPANY} is currently in <strong>invite-only alpha</strong>. Features, pricing,
            data structures, and APIs may change without notice. The Service is provided for
            early-access evaluation only.
          </span>
        </div>
        <p>
          During the alpha period, {COMPANY} reserves the right to modify, suspend, or
          discontinue the Service (or any feature thereof) at any time, with or without notice,
          without liability to you or any third party. Alpha access may be revoked at our
          sole discretion.
        </p>
        <p>
          Data created during the alpha phase may not be migrated to future versions of the
          Service. We will make reasonable efforts to notify active users before any data loss,
          but we make no guarantees.
        </p>
      </Section>

      {/* ── §2 License Grant & Restrictions ── */}
      <Section id="license" num="2" title="License Grant &amp; Restrictions">
        <p>
          Subject to your compliance with these Terms, {COMPANY} grants you a limited,
          non-exclusive, non-transferable, non-sublicensable, revocable licence to access and
          use the Service solely for your internal business purposes.
        </p>
        <p><strong>You may not:</strong></p>
        <ul>
          <li>Reproduce, distribute, sublicense, sell, resell, transfer, or otherwise exploit the Service or any portion of it for commercial purposes without our express written consent.</li>
          <li>Modify, translate, adapt, merge, or create derivative works based on the Service or its underlying software, documentation, or content.</li>
          <li>Reverse-engineer, decompile, disassemble, or attempt to derive source code or underlying algorithms from the Service.</li>
          <li>Remove, obscure, or alter any proprietary notices, trademarks, copyright notices, or labels on or within the Service.</li>
          <li>Use the Service to build a competing product or service, or to benchmark the Service for publication without prior written consent.</li>
          <li>Circumvent, disable, or otherwise interfere with security-related features, rate limits, or access controls.</li>
          <li>Use automated means (bots, scrapers, crawlers) to access the Service at a rate that materially burdens our infrastructure, unless expressly permitted by our API documentation.</li>
          <li>Frame or mirror any part of the Service without written consent.</li>
        </ul>
        <p>
          All rights not expressly granted herein are reserved by {COMPANY}. The Service is
          <strong> licensed, not sold</strong>.
        </p>
      </Section>

      {/* ── §3 Memory, Recall & Accuracy ── */}
      <Section id="memory" num="3" title="Memory, Recall &amp; Accuracy">
        <div
          style={{
            border: "1px solid rgba(0,212,255,0.2)",
            borderRadius: 10,
            padding: "20px 22px",
            background: "rgba(0,212,255,0.04)",
            marginBottom: 16,
          }}
        >
          <p
            style={{
              fontFamily: "var(--display)",
              fontSize: "0.85rem",
              letterSpacing: "0.04em",
              color: "var(--brand)",
              marginBottom: 8,
            }}
          >
            REMEMBERED, NOT GUARANTEED
          </p>
          <p style={{ fontSize: "0.95rem", lineHeight: 1.7 }}>
            {COMPANY} is a <em>precision recall engine</em> — not an oracle, not a validator,
            and not a source of truth. We faithfully surface what your team stored. We do not
            audit, verify, correct, or interpret that content. Information decays, decisions get
            revised, context goes stale, and humans record things imperfectly. Every recalled
            context pack is a starting point for your judgement — never a substitute for it.
          </p>
        </div>
        <p>
          <strong>AI-assisted features:</strong> Where {COMPANY} employs language models or
          automated ranking to surface, summarise, or score memories, those outputs carry the
          inherent limitations of such systems — they may hallucinate, omit, or misrepresent
          information. You are solely responsible for verifying any content before relying on it
          in decisions, communications, code, or advice.
        </p>
        <p>
          {COMPANY} expressly disclaims all liability for decisions made, actions taken, or
          outputs generated based on content recalled from the Service. Use it to inform your
          thinking; exercise your own professional judgement before acting.
        </p>
      </Section>

      {/* ── §4 Data & Privacy ── */}
      <Section id="data" num="4" title="Data &amp; Privacy">
        <p><strong>What we collect</strong></p>
        <ul>
          <li><strong>Account data:</strong> Email address (for invitation and authentication).</li>
          <li><strong>Content data:</strong> Project names and memory card content that you explicitly submit.</li>
          <li><strong>Usage data:</strong> Anonymised event logs (e.g., login timestamps, recall counts) for service operation and abuse prevention. We do not log memory card content in usage events.</li>
          <li>
            <strong>Technical data:</strong> Login IP addresses (stored verbatim for security
            and abuse prevention), hashed user-agent strings, session tokens stored as
            SHA-256 hashes. The system automatically retains only the{" "}
            <strong>last 10 login events per user</strong> — older records are overwritten
            atomically on each new sign-in. All login events are purged automatically after
            90 days by a nightly maintenance task.
          </li>
        </ul>

        <p><strong>What we do not collect</strong></p>
        <ul>
          <li>Passwords — authentication is magic-link only; no password is ever stored.</li>
          <li>Payment information — payment processing is not yet active; no financial data is collected.</li>
          <li>Third-party behavioural tracking cookies or advertising identifiers.</li>
        </ul>

        <p><strong>How we use your data</strong></p>
        <ul>
          <li>To provide, maintain, and improve the Service.</li>
          <li>To send transactional emails (magic-link sign-in only) via Amazon SES.</li>
          <li>To detect and prevent abuse, fraud, and security incidents.</li>
          <li>To contact you about significant Service changes during the alpha phase.</li>
        </ul>

        <p><strong>Data storage &amp; security</strong></p>
        <p>
          All data is stored in a self-hosted PostgreSQL database. We implement
          encryption in transit (TLS), hashed credentials, HttpOnly session cookies,
          and access controls. No data is sold, rented, or shared with third parties for
          marketing purposes.
        </p>

        <p><strong>Retention &amp; deletion</strong></p>
        <p>
          You may request deletion of your data at any time by emailing{" "}
          <a href={`mailto:${EMAIL}`}>{EMAIL}</a>. We will process requests within 30 days.
          Backup retention may extend up to 90 days after deletion.
        </p>

        <p><strong>GDPR / data subject rights</strong></p>
        <p>
          If you are located in the European Economic Area (EEA), you have the right to
          access, rectify, port, or erase your personal data, and to object to or restrict
          processing. Contact us at <a href={`mailto:${EMAIL}`}>{EMAIL}</a> to exercise
          any of these rights.
        </p>
      </Section>

      {/* ── §5 Intellectual Property ── */}
      <Section id="ip" num="5" title="Intellectual Property">
        <p>
          <strong>Our IP:</strong> The Service, its software, design, branding, trademarks,
          and all content produced by {COMPANY} are owned by or licensed to {COMPANY} and
          are protected by copyright, trademark, and other applicable laws. No license to
          any {COMPANY} intellectual property is granted beyond what is expressly stated in
          these Terms.
        </p>
        <p>
          <strong>Trademark notice:</strong> &ldquo;thecontextcache™&rdquo; is a pending
          trademark. The ™ symbol indicates an unregistered trademark claim. We intend to
          register this mark; until registration is confirmed, the ™ symbol (not ®) is used.
          Unauthorised use of the mark or any confusingly similar mark is prohibited.
        </p>
        <p>
          <strong>Your content:</strong> You retain ownership of all memory card content,
          project names, and other data you submit to the Service (&ldquo;Your Content&rdquo;).
          By submitting Your Content, you grant {COMPANY} a limited, royalty-free licence to
          store, retrieve, and display Your Content solely to provide the Service to you.
          We do not claim ownership of Your Content, and we will not use it to train AI models
          or share it with third parties without your consent.
        </p>
        <p>
          <strong>Feedback:</strong> If you submit suggestions, ideas, or feedback about the
          Service, you grant {COMPANY} an irrevocable, royalty-free, worldwide licence to use
          that feedback for any purpose without compensation or attribution to you.
        </p>
      </Section>

      {/* ── §6 Limitation of Liability ── */}
      <Section id="liability" num="6" title="Limitation of Liability &amp; Disclaimer">
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, {COMPANY.toUpperCase()},
          ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY
          INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES —
          INCLUDING LOSS OF PROFITS, DATA, GOODWILL, OR BUSINESS INTERRUPTION — ARISING OUT
          OF OR RELATING TO YOUR USE OF, OR INABILITY TO USE, THE SERVICE.
        </p>
        <p>
          IN NO EVENT SHALL OUR TOTAL CUMULATIVE LIABILITY EXCEED THE GREATER OF (A) THE
          AMOUNTS YOU PAID TO {COMPANY.toUpperCase()} IN THE TWELVE (12) MONTHS PRIOR TO
          THE CLAIM, OR (B) ONE HUNDRED POUNDS STERLING (£100). DURING THE ALPHA PHASE
          WHERE THE SERVICE IS PROVIDED AT NO CHARGE, OUR TOTAL LIABILITY SHALL NOT EXCEED
          £0 (ZERO).
        </p>
        <p>
          THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT
          WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES
          OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.
          {COMPANY.toUpperCase()} DOES NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED,
          ERROR-FREE, OR FREE OF HARMFUL COMPONENTS.
        </p>
      </Section>

      {/* ── §7 Acceptable Use ── */}
      <Section id="conduct" num="7" title="Acceptable Use Policy">
        <p>You agree not to use the Service to:</p>
        <ul>
          <li>Violate any applicable local, national, or international law or regulation.</li>
          <li>Upload, store, or transmit content that is unlawful, harmful, defamatory, obscene, or that infringes third-party rights.</li>
          <li>Impersonate any person or entity, or falsely state your affiliation.</li>
          <li>Transmit unsolicited communications (spam).</li>
          <li>Introduce malicious code, viruses, or other harmful software.</li>
          <li>Conduct any denial-of-service attack, penetration test, or vulnerability scan against the Service without prior written consent.</li>
          <li>Harvest, scrape, or collect data about other users without their consent.</li>
          <li>Engage in any activity that could damage, disable, or impair the Service or other users&apos; access to it.</li>
        </ul>
        <p>
          Violation of this policy may result in immediate termination of your access,
          without notice or liability to you.
        </p>
      </Section>

      {/* ── §8 Indemnification ── */}
      <Section id="indemnification" num="8" title="Indemnification">
        <p>
          You agree to defend, indemnify, and hold harmless {COMPANY} and its officers,
          directors, employees, and agents from and against any claims, liabilities,
          damages, losses, and expenses (including reasonable legal fees) arising out of or
          in any way connected with: (a) your access to or use of the Service; (b) Your
          Content; (c) your violation of these Terms; or (d) your violation of any
          third-party right.
        </p>
      </Section>

      {/* ── §9 Termination ── */}
      <Section id="termination" num="9" title="Termination">
        <p>
          Either party may terminate your access to the Service at any time. {COMPANY} may
          suspend or terminate your account immediately, without notice or liability, if you
          breach any provision of these Terms, if required by law, or if we decide to
          discontinue the Service.
        </p>
        <p>
          Upon termination, all licences granted to you will cease immediately. Sections
          §3, §5, §6, §7, §8, and §10 survive termination.
        </p>
      </Section>

      {/* ── §10 Governing Law ── */}
      <Section id="law" num="10" title="Governing Law &amp; Disputes">
        <p>
          These Terms are governed by and construed in accordance with the laws of England
          and Wales, without regard to conflict of law principles. Any dispute arising from
          these Terms or your use of the Service shall be subject to the exclusive
          jurisdiction of the courts of England and Wales.
        </p>
        <p>
          To the fullest extent permitted by law, disputes shall be resolved by binding
          individual arbitration, and both parties waive any right to a jury trial or to
          participate in class, collective, or representative actions.
        </p>
        <p>
          If the class-action waiver is found unenforceable for a particular claim, only
          that claim may proceed in court, and all remaining claims remain subject to
          individual arbitration.
        </p>
        <p>
          If any provision of these Terms is found to be unenforceable, the remaining
          provisions will remain in full force and effect.
        </p>
      </Section>

      {/* ── §11 Changes ── */}
      <Section id="changes" num="11" title="Changes to These Terms">
        <p>
          We reserve the right to modify these Terms at any time. We will notify active
          users of material changes by email or by displaying a notice within the Service.
          Your continued use of the Service after changes take effect constitutes your
          acceptance of the revised Terms.
        </p>
        <p>
          During the alpha phase, Terms may be updated frequently as the product evolves.
          We recommend reviewing this page periodically.
        </p>
      </Section>

      {/* ── §12 Contact ── */}
      <Section id="contact" num="12" title="Contact">
        <p>
          For legal inquiries, data subject requests, or questions about these Terms:
        </p>
        <div
          style={{
            fontFamily: "var(--mono)", fontSize: "0.85rem",
            background: "var(--panel-2)", border: "1px solid var(--line)",
            borderRadius: 8, padding: "14px 16px",
            color: "var(--brand)", marginTop: 8,
          }}
        >
          {EMAIL}
        </div>
        <p style={{ marginTop: 12 }}>
          Response time target: <strong>5 business days</strong> for general inquiries,{" "}
          <strong>30 days</strong> for data subject requests.
        </p>
      </Section>

      {/* Footer stamp */}
      <div
        style={{
          marginTop: 48,
          paddingTop: 20,
          borderTop: "1px solid var(--line)",
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <span className="muted" style={{ fontFamily: "var(--mono)", fontSize: "0.78rem" }}>
          {COMPANY} · Effective {EFFECTIVE}
        </span>
        <span className="muted" style={{ fontFamily: "var(--mono)", fontSize: "0.78rem" }}>
          Version 1.0-alpha
        </span>
      </div>
    </div>
  );
}

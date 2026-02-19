import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="hero">
      <p className="alpha">Invite-only alpha</p>
      <h1>TheContextCache™</h1>
      <p className="tagline">Project Brain for LLM Systems</p>
      <p className="lede">
        Capture decisions and findings, then recall paste-ready context packs when your team needs them.
      </p>
      <div className="hero-actions">
        <Link href="/auth" className="btn primary">Sign in</Link>
        <Link href="/auth" className="btn secondary">Request access</Link>
      </div>
    </main>
  );
}

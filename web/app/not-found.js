import Link from "next/link";

export const metadata = {
  title: "404 — Page Not Found | ContextCache",
};

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        color: "var(--ink)",
        fontFamily: "var(--font)",
        padding: "2rem",
        textAlign: "center",
        gap: "1.5rem",
      }}
    >
      {/* Large glowing 404 */}
      <div
        style={{
          fontFamily: "var(--display, monospace)",
          fontSize: "clamp(5rem, 18vw, 10rem)",
          fontWeight: 700,
          letterSpacing: "0.05em",
          lineHeight: 1,
          background: "linear-gradient(135deg, var(--brand) 0%, var(--violet) 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          filter: "drop-shadow(0 0 32px rgba(0,212,255,0.4))",
        }}
      >
        404
      </div>

      <div
        style={{
          width: 60,
          height: 2,
          background: "linear-gradient(90deg, transparent, var(--brand), transparent)",
          borderRadius: 2,
        }}
      />

      <h1
        style={{
          fontSize: "clamp(1.25rem, 4vw, 2rem)",
          fontWeight: 600,
          color: "var(--ink)",
          margin: 0,
        }}
      >
        Page not found
      </h1>

      <p
        style={{
          color: "var(--ink-2)",
          maxWidth: 420,
          lineHeight: 1.65,
          margin: 0,
          fontSize: "1rem",
        }}
      >
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
        Double-check the URL, or head back to the dashboard.
      </p>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
        <Link
          href="/"
          style={{
            padding: "0.6rem 1.4rem",
            borderRadius: "var(--radius)",
            background: "var(--brand)",
            color: "var(--brand-ink)",
            fontWeight: 600,
            fontSize: "0.9rem",
            textDecoration: "none",
            transition: "opacity 0.15s",
          }}
        >
          Go home
        </Link>
        <Link
          href="/login"
          style={{
            padding: "0.6rem 1.4rem",
            borderRadius: "var(--radius)",
            border: "1px solid var(--line)",
            color: "var(--ink-2)",
            fontWeight: 500,
            fontSize: "0.9rem",
            textDecoration: "none",
            transition: "border-color 0.15s, color 0.15s",
          }}
        >
          Sign in
        </Link>
      </div>

      {/* Subtle ambient glow */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: "30%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(0,212,255,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
    </main>
  );
}

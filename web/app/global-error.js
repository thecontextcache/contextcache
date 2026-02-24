"use client";

import { useEffect } from "react";

// global-error.js replaces the entire root layout when a fatal error
// occurs in the root segment. It MUST include <html> and <body>.
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <html>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#060C18",
          color: "#E2EEF9",
          fontFamily: "'Space Grotesk', system-ui, sans-serif",
          padding: "2rem",
          textAlign: "center",
          gap: "1.5rem",
        }}
      >
        <div
          style={{
            fontFamily: "'Orbitron', monospace",
            fontSize: "clamp(4rem, 15vw, 8rem)",
            fontWeight: 700,
            lineHeight: 1,
            background: "linear-gradient(135deg, #FF3B6E 0%, #7C3AFF 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            filter: "drop-shadow(0 0 32px rgba(255,59,110,0.4))",
          }}
        >
          500
        </div>

        <div
          style={{
            width: 60,
            height: 2,
            background:
              "linear-gradient(90deg, transparent, #FF3B6E, transparent)",
            borderRadius: 2,
          }}
        />

        <h1
          style={{
            fontSize: "clamp(1.2rem, 4vw, 1.8rem)",
            fontWeight: 600,
            color: "#E2EEF9",
            margin: 0,
          }}
        >
          Something went wrong
        </h1>

        <p
          style={{
            color: "#94ADC8",
            maxWidth: 420,
            lineHeight: 1.65,
            margin: 0,
            fontSize: "1rem",
          }}
        >
          An unexpected error occurred. You can try refreshing the page or
          returning to the dashboard.
        </p>

        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <button
            onClick={reset}
            style={{
              padding: "0.6rem 1.4rem",
              borderRadius: "12px",
              background: "#00D4FF",
              color: "#000D18",
              fontWeight: 600,
              fontSize: "0.9rem",
              border: "none",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <a
            href="/"
            style={{
              padding: "0.6rem 1.4rem",
              borderRadius: "12px",
              border: "1px solid rgba(0,212,255,0.1)",
              color: "#94ADC8",
              fontWeight: 500,
              fontSize: "0.9rem",
              textDecoration: "none",
            }}
          >
            Go home
          </a>
        </div>

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
            background:
              "radial-gradient(circle, rgba(255,59,110,0.06) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
      </body>
    </html>
  );
}

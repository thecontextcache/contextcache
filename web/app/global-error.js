"use client";

import { useEffect } from "react";

// IMPORTANT: global-error.js must NOT include <html><body> in Next.js 14.2.x.
// When a hydration error fires before the React root is established, Next.js
// calls createRoot(document) and then renders this component into it.
// If this component returns <html>, React tries to appendChild a second <html>
// into the document → HierarchyRequestError → entire page goes blank.
// Rendering a plain div avoids this; React inserts it into the existing body.
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
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
        zIndex: 99999,
      }}
    >
      <div
        style={{
          fontFamily: "monospace",
          fontSize: "clamp(4rem, 15vw, 8rem)",
          fontWeight: 700,
          lineHeight: 1,
          background: "linear-gradient(135deg, #FF3B6E 0%, #7C3AFF 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        500
      </div>

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
        An unexpected error occurred. Try refreshing the page.
      </p>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
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
    </div>
  );
}

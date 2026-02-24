"use client";

import { useEffect } from "react";

export default function RootError({ error, reset }) {
  useEffect(() => {
    console.error("[root error boundary]", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        textAlign: "center",
        gap: "1.2rem",
      }}
    >
      <div style={{ fontSize: "3.5rem" }}>⚠️</div>
      <h1
        style={{
          margin: 0,
          fontSize: "1.4rem",
          fontWeight: 700,
          color: "var(--ink, #e2eef9)",
        }}
      >
        Something went wrong
      </h1>
      <p
        style={{
          margin: 0,
          color: "var(--muted, #94adc8)",
          maxWidth: 400,
          lineHeight: 1.6,
          fontSize: "0.92rem",
        }}
      >
        {error?.message || "An unexpected error occurred."}
      </p>
      <div style={{ display: "flex", gap: "0.75rem", marginTop: 8 }}>
        <button
          onClick={reset}
          style={{
            padding: "8px 22px",
            borderRadius: 10,
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
            padding: "8px 22px",
            borderRadius: 10,
            border: "1px solid rgba(0,212,255,0.2)",
            color: "var(--muted, #94adc8)",
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

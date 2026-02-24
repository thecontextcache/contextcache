"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AppError({ error, reset }) {
  useEffect(() => {
    console.error("[/app error boundary]", error);
  }, [error]);

  return (
    <div style={{
      minHeight: "60vh",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "40px 24px", textAlign: "center", gap: 16,
    }}>
      <div style={{ fontSize: 40 }}>⚠️</div>
      <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
        Something went wrong
      </h2>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.88rem", maxWidth: 380 }}>
        {error?.message || "An unexpected error occurred in the application."}
      </p>
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={reset}
          className="btn primary sm"
          style={{ padding: "8px 20px" }}
        >
          Try again
        </button>
        <Link href="/" className="btn ghost sm" style={{ padding: "8px 20px" }}>
          Go home
        </Link>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

function buildDefaultApiBase() {
  if (typeof window === "undefined") return "http://localhost:8000";
  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

export default function VerifyClient({ token }) {
  const apiBase = useMemo(() => process.env.NEXT_PUBLIC_API_BASE_URL || buildDefaultApiBase(), []);
  const router = useRouter();
  const [message, setMessage] = useState("Verifying sign-in link...");

  useEffect(() => {
    if (!token) {
      setMessage("Missing token.");
      return;
    }

    async function verify() {
      try {
        const response = await fetch(`${apiBase}/auth/verify?token=${encodeURIComponent(token)}`, {
          method: "GET",
          credentials: "include",
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.detail || "Verification failed");
        setMessage("Success. Redirecting...");
        router.replace("/app");
      } catch (error) {
        setMessage(error.message || "Verification failed");
      }
    }

    verify();
  }, [apiBase, token, router]);

  return (
    <main className="auth-wrap card">
      <h1>Verify sign in</h1>
      <p>{message}</p>
    </main>
  );
}

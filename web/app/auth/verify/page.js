import { Suspense } from "react";
import VerifyClient from "./verify-client";


export default function VerifyPage({ searchParams }) {
  const token = searchParams?.token || "";

  return (
    <Suspense
      fallback={
        <main className="auth-wrap card">
          <h1>Verify</h1>
          <p>Loading…</p>
        </main>
      }
    >
      <VerifyClient token={token} />
    </Suspense>
  );
}

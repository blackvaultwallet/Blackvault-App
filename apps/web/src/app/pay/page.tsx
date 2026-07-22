"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function PayRedirect() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    // Store the request generically so both chains can read it (Solana uses
    // to/amount; EVM also uses token/note). Each app validates the address.
    const to = params.get("to")?.trim();
    if (to) {
      const amountStr = params.get("amount");
      const amount = amountStr ? parseFloat(amountStr) : undefined;
      const req = {
        to,
        amount: amount && Number.isFinite(amount) && amount > 0 ? amount : undefined,
        token: params.get("token") || undefined,
        note: params.get("note") || undefined,
      };
      try {
        sessionStorage.setItem("bv_pay_request", JSON.stringify(req));
      } catch {
        // storage unavailable
      }
    }
    router.replace("/");
  }, [params, router]);

  return (
    <main className="flex min-h-screen items-center justify-center text-sm text-muted">
      Opening your vault…
    </main>
  );
}

export default function PayPage() {
  return (
    <Suspense>
      <PayRedirect />
    </Suspense>
  );
}

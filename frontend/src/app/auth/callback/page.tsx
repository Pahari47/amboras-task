"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setStoredToken } from "@/lib/auth";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash =
      typeof window !== "undefined"
        ? window.location.hash.replace(/^#/, "")
        : "";
    const params = new URLSearchParams(hash);
    const token = params.get("access_token");
    if (!token) {
      setError("Missing access token. Try signing in again.");
      return;
    }
    setStoredToken(token);
    router.replace("/dashboard");
  }, [router]);

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4">
        <p className="text-center text-red-600 dark:text-red-400">{error}</p>
        <a
          href="/"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Back to home
        </a>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 px-4">
      <p className="text-zinc-600 dark:text-zinc-400">Signing you in…</p>
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-800 dark:border-zinc-600 dark:border-t-zinc-200" />
    </div>
  );
}

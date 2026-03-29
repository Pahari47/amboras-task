"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiGet } from "@/lib/api";
import { clearStoredToken, getStoredToken } from "@/lib/auth";
import type {
  OverviewResponse,
  RecentEventRow,
  TopProductRow,
  MeResponse,
} from "@/types/analytics";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatPct(n: number | null): string {
  if (n === null || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse["user"] | null>(null);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [topProducts, setTopProducts] = useState<TopProductRow[] | null>(null);
  const [recent, setRecent] = useState<RecentEventRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!getStoredToken()) {
      router.replace("/");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [meRes, ov, tp, act] = await Promise.all([
        apiGet<MeResponse>("/api/v1/auth/me"),
        apiGet<OverviewResponse>("/api/v1/analytics/overview"),
        apiGet<TopProductRow[]>("/api/v1/analytics/top-products"),
        apiGet<RecentEventRow[]>("/api/v1/analytics/recent-activity"),
      ]);
      setMe(meRes.user);
      setOverview(ov);
      setTopProducts(tp);
      setRecent(act);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  function signOut() {
    clearStoredToken();
    router.replace("/");
  }

  const chartData = overview
    ? Object.entries(overview.eventsByType).map(([name, value]) => ({
        name: name.replace(/_/g, " "),
        count: value,
      }))
    : [];

  if (loading && !overview) {
    return (
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800"
            />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Store analytics
          </h1>
          {me && (
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {me.email}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={signOut}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Sign out
          </button>
        </div>
      </header>

      {error && (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          role="alert"
        >
          {error}
        </div>
      )}

      {overview && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Revenue today"
              value={money.format(overview.revenue.today)}
            />
            <MetricCard
              label="Revenue this week"
              value={money.format(overview.revenue.week)}
            />
            <MetricCard
              label="Revenue this month"
              value={money.format(overview.revenue.month)}
            />
            <MetricCard
              label="Conversion rate"
              subtitle="purchases / page views"
              value={formatPct(overview.conversionRate)}
            />
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="mb-4 text-sm font-medium text-zinc-500">
                Events by type
              </h2>
              <div className="h-64 w-full min-w-0 shrink-0">
                <ResponsiveContainer width="100%" height={256}>
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      interval={0}
                      angle={-25}
                      textAnchor="end"
                      height={64}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid #e4e4e7",
                      }}
                    />
                    <Bar dataKey="count" fill="#18181b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="mb-4 text-sm font-medium text-zinc-500">
                Funnel totals
              </h2>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-600 dark:text-zinc-400">Page views</dt>
                  <dd className="font-medium tabular-nums">
                    {overview.totals.pageViews}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-600 dark:text-zinc-400">Purchases</dt>
                  <dd className="font-medium tabular-nums">
                    {overview.totals.purchases}
                  </dd>
                </div>
              </dl>
            </div>
          </section>
        </>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="mb-4 text-sm font-medium text-zinc-500">
            Top products (revenue)
          </h2>
          {!topProducts?.length ? (
            <p className="text-sm text-zinc-500">No purchase data yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {topProducts.map((row) => (
                <li
                  key={row.productId}
                  className="flex items-center justify-between gap-4 py-3 text-sm first:pt-0"
                >
                  <span className="truncate font-mono text-zinc-800 dark:text-zinc-200">
                    {row.productId}
                  </span>
                  <span className="shrink-0 tabular-nums font-medium">
                    {money.format(row.revenue)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="mb-4 text-sm font-medium text-zinc-500">
            Recent activity
          </h2>
          {!recent?.length ? (
            <p className="text-sm text-zinc-500">No events yet.</p>
          ) : (
            <ul className="max-h-80 space-y-3 overflow-y-auto pr-1 text-sm">
              {recent.map((ev) => (
                <li
                  key={ev.eventId}
                  className="rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {ev.eventType.replace(/_/g, " ")}
                    </span>
                    <time
                      className="text-xs text-zinc-500"
                      dateTime={ev.timestamp}
                    >
                      {new Date(ev.timestamp).toLocaleString()}
                    </time>
                  </div>
                  {ev.amount != null && (
                    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                      {money.format(ev.amount)}
                      {ev.productId ? ` · ${ev.productId}` : ""}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      {subtitle && (
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{subtitle}</p>
      )}
      <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
        {value}
      </p>
    </div>
  );
}

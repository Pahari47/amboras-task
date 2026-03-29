"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
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
  LiveVisitorsResponse,
} from "@/types/analytics";

const POLL_MS = 25_000;

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
  const [live, setLive] = useState<LiveVisitorsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastPollAt, setLastPollAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    if (!getStoredToken()) {
      router.replace("/");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [meRes, ov, tp, act, lv] = await Promise.all([
        apiGet<MeResponse>("/api/v1/auth/me"),
        apiGet<OverviewResponse>("/api/v1/analytics/overview"),
        apiGet<TopProductRow[]>("/api/v1/analytics/top-products"),
        apiGet<RecentEventRow[]>("/api/v1/analytics/recent-activity"),
        apiGet<LiveVisitorsResponse>("/api/v1/analytics/live-visitors"),
      ]);
      setMe(meRes.user);
      setOverview(ov);
      setTopProducts(tp);
      setRecent(act);
      setLive(lv);
      setLastPollAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [router]);

  const poll = useCallback(async () => {
    if (!getStoredToken()) return;
    try {
      const [ov, tp, act, lv] = await Promise.all([
        apiGet<OverviewResponse>("/api/v1/analytics/overview"),
        apiGet<TopProductRow[]>("/api/v1/analytics/top-products"),
        apiGet<RecentEventRow[]>("/api/v1/analytics/recent-activity"),
        apiGet<LiveVisitorsResponse>("/api/v1/analytics/live-visitors"),
      ]);
      setOverview(ov);
      setTopProducts(tp);
      setRecent(act);
      setLive(lv);
      setLastPollAt(new Date());
    } catch {
      /* keep previous data on transient poll errors */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => void poll(), POLL_MS);
    return () => window.clearInterval(id);
  }, [poll]);

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
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-5xl flex-col gap-8 px-5 py-12 sm:px-8">
          <div className="h-8 w-40 animate-pulse rounded-md bg-zinc-200/80 dark:bg-zinc-800" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-2xl bg-zinc-200/60 dark:bg-zinc-800/80"
              />
            ))}
          </div>
          <div className="h-56 animate-pulse rounded-2xl bg-zinc-200/60 dark:bg-zinc-800/80" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-5 py-10 sm:px-8 sm:py-12">
        <header className="flex flex-col gap-6 border-b border-zinc-200/80 pb-8 dark:border-zinc-800/80 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-lg font-medium tracking-tight text-zinc-900 dark:text-zinc-100">
              Analytics
            </h1>
            {me && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {me.email}
              </p>
            )}
            {lastPollAt && (
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                Updated {lastPollAt.toLocaleTimeString()} · every {POLL_MS / 1000}s
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="text-sm text-zinc-600 transition hover:text-zinc-900 disabled:opacity-40 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={signOut}
              className="text-sm text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Sign out
            </button>
          </div>
        </header>

        {error && (
          <div
            className="rounded-lg border border-red-200/80 bg-red-50/90 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200/90"
            role="alert"
          >
            {error}
          </div>
        )}

        {overview && (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <MetricCard
                label="Today"
                value={money.format(overview.revenue.today)}
              />
              <MetricCard
                label="This week"
                value={money.format(overview.revenue.week)}
              />
              <MetricCard
                label="This month"
                value={money.format(overview.revenue.month)}
              />
              <MetricCard
                label="Conversion"
                subtitle="purchases / views"
                value={formatPct(overview.conversionRate)}
              />
              <MetricCard
                label="Live"
                subtitle={
                  live
                    ? `${live.windowMinutes} min window`
                    : undefined
                }
                value={
                  live != null ? String(live.pageViewsInWindow) : "—"
                }
              />
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <Panel title="Events by type">
                <div className="h-56 w-full min-w-0">
                  <ResponsiveContainer width="100%" height={224}>
                    <BarChart
                      data={chartData}
                      margin={{ top: 4, right: 4, left: -8, bottom: 4 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="currentColor"
                        className="text-zinc-200 dark:text-zinc-800"
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 10, fill: "currentColor" }}
                        className="text-zinc-400"
                        interval={0}
                        angle={-20}
                        textAnchor="end"
                        height={52}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 10, fill: "currentColor" }}
                        className="text-zinc-400"
                        width={32}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: "transparent" }}
                        contentStyle={{
                          borderRadius: "8px",
                          border: "none",
                          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
                          fontSize: "12px",
                        }}
                      />
                      <Bar
                        dataKey="count"
                        fill="#52525b"
                        radius={[3, 3, 0, 0]}
                        maxBarSize={40}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <Panel title="Funnel">
                <dl className="space-y-4 text-sm">
                  <div className="flex justify-between gap-6 border-b border-zinc-100 pb-3 dark:border-zinc-800/80">
                    <dt className="text-zinc-500">Page views</dt>
                    <dd className="tabular-nums text-zinc-900 dark:text-zinc-100">
                      {overview.totals.pageViews}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-6">
                    <dt className="text-zinc-500">Purchases</dt>
                    <dd className="tabular-nums text-zinc-900 dark:text-zinc-100">
                      {overview.totals.purchases}
                    </dd>
                  </div>
                </dl>
              </Panel>
            </section>
          </>
        )}

        <section className="grid gap-6 lg:grid-cols-2">
          <Panel title="Top products">
            {!topProducts?.length ? (
              <p className="text-sm text-zinc-400">No purchase data.</p>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {topProducts.map((row) => (
                  <li
                    key={row.productId}
                    className="flex items-center justify-between gap-4 py-2.5 text-sm first:pt-0"
                  >
                    <span className="truncate font-mono text-[13px] text-zinc-700 dark:text-zinc-300">
                      {row.productId}
                    </span>
                    <span className="shrink-0 tabular-nums text-zinc-900 dark:text-zinc-100">
                      {money.format(row.revenue)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Recent activity">
            {!recent?.length ? (
              <p className="text-sm text-zinc-400">No events.</p>
            ) : (
              <ul className="no-scrollbar max-h-72 space-y-0 overflow-y-auto pr-1">
                {recent.map((ev) => (
                  <li
                    key={ev.eventId}
                    className="border-b border-zinc-100 py-2.5 last:border-0 dark:border-zinc-800/60"
                  >
                    <div className="flex items-start justify-between gap-3 text-sm">
                      <span className="text-zinc-800 dark:text-zinc-200">
                        {ev.eventType.replace(/_/g, " ")}
                      </span>
                      <time
                        className="shrink-0 text-xs tabular-nums text-zinc-400"
                        dateTime={ev.timestamp}
                      >
                        {new Date(ev.timestamp).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                    {ev.amount != null && (
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {money.format(ev.amount)}
                        {ev.productId ? ` · ${ev.productId}` : ""}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </section>
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white/80 px-5 py-4 dark:border-zinc-800/80 dark:bg-zinc-900/40">
      <h2 className="mb-4 text-xs font-medium uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">
        {title}
      </h2>
      {children}
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
    <div className="rounded-2xl border border-zinc-200/70 bg-white/90 px-4 py-3 dark:border-zinc-800/70 dark:bg-zinc-900/50">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      {subtitle && (
        <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">
          {subtitle}
        </p>
      )}
      <p className="mt-2 text-xl font-medium tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
        {value}
      </p>
    </div>
  );
}

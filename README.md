# Store Analytics Dashboard

I built a small full-stack analytics app for multi-tenant store events: NestJS + Prisma + Postgres, optional Redis for caching, and a Next.js dashboard with Google OAuth.

---

## Setup Instructions

**Prerequisites**

- Node.js 20+ (I used 22 locally)
- PostgreSQL 14+ (local or Docker)
- Redis 6+ (optional—the API still works without `REDIS_URL`; it just skips the cache)
- A Google Cloud OAuth client (Web application type) for login

**1. Clone and install**

```bash
git clone <your-repo-url>
cd amboras-task
```

```bash
cd backend && npm install
cd ../frontend && npm install
```

**2. Environment**

Copy `.env.example` to `.env` at the repo root and fill in the values. also keep:

- **`frontend/.env.local`** — `NEXT_PUBLIC_API_URL=http://localhost:3000` (or wherever the API runs).

In Google Cloud Console registered this **Authorized redirect URI**:

`http://localhost:3000/api/v1/auth/google/callback`

**3. Database**

From `backend/`:

```bash
npx prisma migrate dev
npx prisma db seed
```

**4. Run**

Terminal A (API, port **3000** by default):

```bash
cd backend
npm run start:dev
```

Terminal B (UI, port **3001**):

```bash
cd frontend
npm run dev
```

open **http://localhost:3001**, hit “Continue with Google,” and after the callback I land on the dashboard. All API routes are under **`/api/v1`**.

**Redis**

If point `REDIS_URL` at something like `redis://localhost:6379`, the analytics endpoints use short-lived cached JSON. If I skip Redis, every request recomputes from Postgres.

---

## Architecture Decisions

### Data Aggregation Strategy

- **Decision:** On-read aggregation with Prisma: revenue over time windows, `groupBy` for counts and top products, `aggregate`/`count` where it fits. Every query filters by `storeId` from the JWT—never from the client body for authorization.
- **Why:** I didn’t want to maintain separate rollup tables and backfill jobs inside this scope. Postgres plus indexes was enough to keep reads reasonable for the data sizes I tested.
- **Trade-offs:** Heavier reads when the cache is cold. In return I kept the model simple: events stay the source of truth, and the mental model for reviewers stays straightforward.

### Real-time vs. Batch Processing

- **Decision:** Hybrid. The dashboard polls the REST API on an interval (about every 25s) for overview, top products, recent activity, and a “live” proxy metric. I cache hot responses in Redis (~60–90s TTL). I also run a **cron job every minute** that pre-warms the live snapshot per store when Redis is on, so the “live” number is often already in cache when the UI asks.
- **Why:** I wasn’t trying to ship WebSockets for complexity. Polling plus cache gave me something demoable and easy to explain. The “live” metric is intentionally a proxy—page views in a rolling window—not a perfect unique-visitor count.
- **Trade-offs:** Data can lag by a poll interval or a TTL. I accepted that for simpler ops and predictable server load.

### Frontend Data Fetching

- **Decision:** Client-side dashboard pages that `fetch` the API with `Authorization: Bearer <token>` and `cache: "no-store"`. After Google redirects back, I stash the JWT (from the URL fragment) and use it for subsequent calls.
- **Why:** It matched how I wanted to build the UI—loading states, charts, refresh—without fighting RSC for authenticated data on every navigation.
- **Trade-offs:** No SSR for the dashboard metrics. Fine for an internal-style dashboard; I’d revisit if this needed SEO or stricter security around tokens.

### Performance Optimizations

- Composite indexes on `StoreEvent` for `storeId` + `timestamp`, `storeId` + `eventType`, and related patterns so aggregates don’t table-scan.
- Optional Redis keys for overview, top products, and live visitors to avoid repeating the same aggregates on every refresh.
- Capped list sizes (20 recent events, 10 top products).
- `Promise.all` on the backend where overview metrics are independent.

---

## Known Limitations

- There’s no continuous event producer in this repo, I rely on seed data (and optional manual DB changes). In production, ingest would hit an API or queue; I focused on the read path and tenant isolation.
- “Live” traffic is a **count of `page_view` rows in the last N minutes**, not sessions or unique visitors.
- With Redis enabled, cached values can be briefly stale until TTL expires; I don’t invalidate on write because there’s no public ingest endpoint in scope.
- Conversion is **total purchases / total page views** for that store in the database—simplified compared to real attribution.
- OAuth + JWT here are demo-grade; I’d add refresh flows, rate limits, and harder session handling in production.

---

## What I'd Improve With More Time

- Invalidate Redis keys when new events land (or shorter TTLs + ingest path).
- Daily or hourly rollup tables for revenue and funnel at very large event volume.
- SSE or WebSocket only for “new events” if I needed true push.
- OpenAPI / Swagger and a few E2E tests around login and analytics.
- Tighter observability: cache hit metrics, query timings.

---

## Time Spent

About **3–3.5 hours** for implementation, wiring, and this write-up—rough calibration for the assignment.

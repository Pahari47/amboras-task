import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { EventType, Prisma, PrismaClient } from '@prisma/client';

const STORE_ID = process.env.SEED_STORE_ID ?? 'seed_store_demo_001';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const EVENT_TYPES = [
  EventType.page_view,
  EventType.add_to_cart,
  EventType.remove_from_cart,
  EventType.checkout_started,
  EventType.purchase,
] as const;

const PRODUCTS = ['prod_alpha', 'prod_beta', 'prod_gamma', 'prod_delta', 'prod_epsilon'];

function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function randomAmount(): number {
  return Math.round((9.99 + Math.random() * 90) * 100) / 100;
}

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
}

function startOfUtcWeekMonday(d: Date): Date {
  const day = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const dow = day.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  day.setUTCDate(day.getUTCDate() + diff);
  return day;
}

type Row = {
  eventId: string;
  storeId: string;
  eventType: (typeof EVENT_TYPES)[number];
  timestamp: Date;
  data: Prisma.InputJsonValue;
  productId?: string;
  amount?: string;
  currency?: string;
};

async function main() {
  await prisma.store.upsert({
    where: { id: STORE_ID },
    create: { id: STORE_ID, name: 'Demo analytics store (seed)' },
    update: {},
  });

  await prisma.storeEvent.deleteMany({ where: { storeId: STORE_ID } });

  const now = new Date();
  const batch: Row[] = [];
  let seq = 0;
  const eid = (prefix: string) => `evt_${prefix}_${seq++}_${STORE_ID}`;

  // --- 1) Historical noise (past weeks, not today): funnel + month context ---
  for (let i = 0; i < 280; i++) {
    const daysAgo = 2 + Math.floor(Math.random() * 33);
    const ts = new Date(
      now.getTime() - daysAgo * 86400000 - Math.random() * 86400000,
    );
    const type = randomItem(EVENT_TYPES);
    if (type === EventType.purchase) {
      const productId = randomItem(PRODUCTS);
      const amount = randomAmount();
      batch.push({
        eventId: eid('hist'),
        storeId: STORE_ID,
        eventType: type,
        timestamp: ts,
        data: {
          product_id: productId,
          amount,
          currency: 'USD',
        } satisfies Prisma.InputJsonValue,
        productId,
        amount: amount.toFixed(2),
        currency: 'USD',
      });
    } else {
      batch.push({
        eventId: eid('hist'),
        storeId: STORE_ID,
        eventType: type,
        timestamp: ts,
        data: { source: 'seed' } satisfies Prisma.InputJsonValue,
      });
    }
  }

  const todayStart = startOfUtcDay(now);
  const weekStart = startOfUtcWeekMonday(now);

  // --- 2) This calendar week (before today) extra purchases for "week" revenue ---
  const weekBeforeTodayMs = todayStart.getTime() - 1 - weekStart.getTime();
  if (weekBeforeTodayMs > 0) {
    for (let i = 0; i < 12; i++) {
      const ts = new Date(
        weekStart.getTime() + Math.random() * weekBeforeTodayMs,
      );
      const productId = PRODUCTS[i % PRODUCTS.length]!;
      const amount = 29.99 + i * 5;
      batch.push({
        eventId: eid('week'),
        storeId: STORE_ID,
        eventType: EventType.purchase,
        timestamp: ts,
        data: {
          product_id: productId,
          amount,
          currency: 'USD',
        } satisfies Prisma.InputJsonValue,
        productId,
        amount: amount.toFixed(2),
        currency: 'USD',
      });
    }
  }

  // --- 3) Today (UTC): strong page_view + purchases so conversion + revenue today pop ---
  const msIntoToday = now.getTime() - todayStart.getTime();
  for (let i = 0; i < 45; i++) {
    const ts = new Date(
      todayStart.getTime() + Math.random() * Math.max(1, msIntoToday),
    );
    batch.push({
      eventId: eid('today_pv'),
      storeId: STORE_ID,
      eventType: EventType.page_view,
      timestamp: ts,
      data: { path: '/products', source: 'seed_today' } satisfies Prisma.InputJsonValue,
    });
  }
  for (let i = 0; i < 12; i++) {
    const ts = new Date(
      todayStart.getTime() + Math.random() * Math.max(1, msIntoToday),
    );
    batch.push({
      eventId: eid('today_cart'),
      storeId: STORE_ID,
      eventType: EventType.add_to_cart,
      timestamp: ts,
      data: { sku: PRODUCTS[i % PRODUCTS.length] } satisfies Prisma.InputJsonValue,
    });
  }
  const todayPurchases: { productId: string; amount: number }[] = [
    { productId: 'prod_alpha', amount: 149.99 },
    { productId: 'prod_beta', amount: 79.5 },
    { productId: 'prod_gamma', amount: 199 },
    { productId: 'prod_alpha', amount: 49.99 },
    { productId: 'prod_delta', amount: 24.99 },
    { productId: 'prod_beta', amount: 129 },
  ];
  for (let i = 0; i < todayPurchases.length; i++) {
    const { productId, amount } = todayPurchases[i]!;
    const ts = new Date(
      todayStart.getTime() + ((i + 1) / (todayPurchases.length + 1)) * msIntoToday,
    );
    batch.push({
      eventId: eid('today_buy'),
      storeId: STORE_ID,
      eventType: EventType.purchase,
      timestamp: ts,
      data: {
        product_id: productId,
        amount,
        currency: 'USD',
      } satisfies Prisma.InputJsonValue,
      productId,
      amount: amount.toFixed(2),
      currency: 'USD',
    });
  }

  // --- 4) Last ~4 minutes: "live" page views + mixed events for recent activity ---
  const liveSpanMs = 4 * 60 * 1000;
  for (let i = 0; i < 35; i++) {
    const ts = new Date(now.getTime() - Math.random() * liveSpanMs);
    batch.push({
      eventId: eid('live_pv'),
      storeId: STORE_ID,
      eventType: EventType.page_view,
      timestamp: ts,
      data: { path: i % 2 === 0 ? '/' : '/checkout', live: true } satisfies Prisma.InputJsonValue,
    });
  }
  const liveMix: (typeof EVENT_TYPES)[number][] = [
    EventType.add_to_cart,
    EventType.checkout_started,
    EventType.purchase,
    EventType.add_to_cart,
    EventType.page_view,
    EventType.remove_from_cart,
  ];
  for (let i = 0; i < liveMix.length; i++) {
    const type = liveMix[i]!;
    const ts = new Date(now.getTime() - Math.random() * liveSpanMs);
    const eventId = eid('live_mix');
    if (type === EventType.purchase) {
      const productId = 'prod_alpha';
      const amount = 19.99;
      batch.push({
        eventId,
        storeId: STORE_ID,
        eventType: type,
        timestamp: ts,
        data: {
          product_id: productId,
          amount,
          currency: 'USD',
        } satisfies Prisma.InputJsonValue,
        productId,
        amount: amount.toFixed(2),
        currency: 'USD',
      });
    } else {
      batch.push({
        eventId,
        storeId: STORE_ID,
        eventType: type,
        timestamp: ts,
        data: { live: true } satisfies Prisma.InputJsonValue,
      });
    }
  }

  await prisma.storeEvent.createMany({ data: batch });

  console.log(
    `Seeded store ${STORE_ID} with ${batch.length} events (historical + this week + today + last ~4 min "live").`,
  );
  console.log(
    'Set SEED_ATTACH_EMAIL to your Google email so first OAuth lands on this store.',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

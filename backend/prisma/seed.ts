import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { EventType } from '../generated/prisma/enums';

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

function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function randomAmount(): number {
  return Math.round((5 + Math.random() * 95) * 100) / 100;
}

async function main() {
  await prisma.store.upsert({
    where: { id: STORE_ID },
    create: { id: STORE_ID, name: 'Demo analytics store (seed)' },
    update: {},
  });

  const products = ['prod_alpha', 'prod_beta', 'prod_gamma', 'prod_delta'];

  await prisma.storeEvent.deleteMany({ where: { storeId: STORE_ID } });

  const now = Date.now();
  const batch: {
    eventId: string;
    storeId: string;
    eventType: (typeof EVENT_TYPES)[number];
    timestamp: Date;
    data: Prisma.InputJsonValue;
    productId?: string;
    amount?: string;
    currency?: string;
  }[] = [];

  for (let i = 0; i < 400; i++) {
    const daysAgo = Math.floor(Math.random() * 35);
    const ts = new Date(now - daysAgo * 86400000 - Math.random() * 86400000);
    const type = randomItem(EVENT_TYPES);
    const eventId = `evt_seed_${i}_${STORE_ID}`;

    if (type === EventType.purchase) {
      const productId = randomItem(products);
      const amount = randomAmount();
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
        data: { source: 'seed' } satisfies Prisma.InputJsonValue,
      });
    }
  }

  await prisma.storeEvent.createMany({ data: batch });

  console.log(
    `Seeded store ${STORE_ID} with ${batch.length} events. Link a User to this storeId in Prisma Studio to view demo analytics, or set SEED_ATTACH_EMAIL (see README).`,
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

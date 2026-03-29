import { Injectable } from '@nestjs/common';
import { EventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const TTL_OVERVIEW_SEC = 60;
const TTL_TOP_PRODUCTS_SEC = 60;
const TTL_LIVE_SEC = 90;
const LIVE_WINDOW_MINUTES = 5;

const k = {
  overview: (storeId: string) => `analytics:overview:${storeId}`,
  topProducts: (storeId: string) => `analytics:top-products:${storeId}`,
  live: (storeId: string) => `analytics:live:${storeId}`,
};

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
}

function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

/** Monday 00:00 UTC for the week containing `d` */
function startOfUtcWeekMonday(d: Date): Date {
  const day = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const dow = day.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  day.setUTCDate(day.getUTCDate() + diff);
  return day;
}

function decimalToNumber(value: { toString(): string } | null | undefined): number {
  if (value == null) return 0;
  return Number(value.toString());
}

export type OverviewPayload = {
  revenue: {
    today: number;
    week: number;
    month: number;
  };
  eventsByType: Record<string, number>;
  conversionRate: number | null;
  totals: {
    purchases: number;
    pageViews: number;
  };
};

export type LiveVisitorsPayload = {
  windowMinutes: number;
  pageViewsInWindow: number;
  computedAt: string;
};

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getOverview(storeId: string): Promise<OverviewPayload> {
    if (this.redis.isEnabled()) {
      const raw = await this.redis.get(k.overview(storeId));
      if (raw) {
        return JSON.parse(raw) as OverviewPayload;
      }
    }
    const payload = await this.computeOverview(storeId);
    if (this.redis.isEnabled()) {
      await this.redis.setex(
        k.overview(storeId),
        TTL_OVERVIEW_SEC,
        JSON.stringify(payload),
      );
    }
    return payload;
  }

  async getTopProducts(storeId: string) {
    if (this.redis.isEnabled()) {
      const raw = await this.redis.get(k.topProducts(storeId));
      if (raw) {
        return JSON.parse(raw) as {
          productId: string;
          revenue: number;
        }[];
      }
    }
    const rows = await this.computeTopProducts(storeId);
    if (this.redis.isEnabled()) {
      await this.redis.setex(
        k.topProducts(storeId),
        TTL_TOP_PRODUCTS_SEC,
        JSON.stringify(rows),
      );
    }
    return rows;
  }

  async getRecentActivity(storeId: string) {
    const rows = await this.prisma.storeEvent.findMany({
      where: { storeId },
      orderBy: { timestamp: 'desc' },
      take: 20,
      select: {
        eventId: true,
        eventType: true,
        timestamp: true,
        data: true,
        productId: true,
        amount: true,
        currency: true,
      },
    });

    return rows.map((r) => ({
      eventId: r.eventId,
      eventType: r.eventType,
      timestamp: r.timestamp.toISOString(),
      data: r.data,
      productId: r.productId,
      amount: r.amount != null ? decimalToNumber(r.amount) : null,
      currency: r.currency,
    }));
  }

  async getLiveVisitors(storeId: string): Promise<LiveVisitorsPayload> {
    if (this.redis.isEnabled()) {
      const raw = await this.redis.get(k.live(storeId));
      if (raw) {
        return JSON.parse(raw) as LiveVisitorsPayload;
      }
    }
    return this.computeLiveVisitors(storeId);
  }

  /** Called by cron every minute to refresh Redis before polls hit the API. */
  async warmLiveCache(storeId: string): Promise<void> {
    await this.computeLiveVisitors(storeId);
  }

  private async computeOverview(storeId: string): Promise<OverviewPayload> {
    const now = new Date();
    const todayStart = startOfUtcDay(now);
    const weekStart = startOfUtcWeekMonday(now);
    const monthStart = startOfUtcMonth(now);

    const [
      revenueToday,
      revenueWeek,
      revenueMonth,
      counts,
      purchases,
      pageViews,
    ] = await Promise.all([
      this.sumPurchaseRevenue(storeId, todayStart, now),
      this.sumPurchaseRevenue(storeId, weekStart, now),
      this.sumPurchaseRevenue(storeId, monthStart, now),
      this.prisma.storeEvent.groupBy({
        by: ['eventType'],
        where: { storeId },
        _count: { _all: true },
      }),
      this.prisma.storeEvent.count({
        where: { storeId, eventType: EventType.purchase },
      }),
      this.prisma.storeEvent.count({
        where: { storeId, eventType: EventType.page_view },
      }),
    ]);

    const eventsByType = Object.fromEntries(
      counts.map((c) => [c.eventType, c._count._all]),
    ) as Record<string, number>;

    const conversionRate = pageViews > 0 ? purchases / pageViews : null;

    return {
      revenue: {
        today: revenueToday,
        week: revenueWeek,
        month: revenueMonth,
      },
      eventsByType,
      conversionRate,
      totals: {
        purchases,
        pageViews,
      },
    };
  }

  private async computeTopProducts(storeId: string) {
    const rows = await this.prisma.storeEvent.groupBy({
      by: ['productId'],
      where: {
        storeId,
        eventType: EventType.purchase,
        productId: { not: null },
      },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 10,
    });

    return rows.map((r) => ({
      productId: r.productId as string,
      revenue: decimalToNumber(r._sum.amount),
    }));
  }

  private async computeLiveVisitors(storeId: string): Promise<LiveVisitorsPayload> {
    const from = new Date(Date.now() - LIVE_WINDOW_MINUTES * 60 * 1000);
    const pageViewsInWindow = await this.prisma.storeEvent.count({
      where: {
        storeId,
        eventType: EventType.page_view,
        timestamp: { gte: from },
      },
    });
    const payload: LiveVisitorsPayload = {
      windowMinutes: LIVE_WINDOW_MINUTES,
      pageViewsInWindow,
      computedAt: new Date().toISOString(),
    };
    if (this.redis.isEnabled()) {
      await this.redis.setex(
        k.live(storeId),
        TTL_LIVE_SEC,
        JSON.stringify(payload),
      );
    }
    return payload;
  }

  private async sumPurchaseRevenue(
    storeId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    const agg = await this.prisma.storeEvent.aggregate({
      where: {
        storeId,
        eventType: EventType.purchase,
        timestamp: { gte: from, lte: to },
      },
      _sum: { amount: true },
    });
    return decimalToNumber(agg._sum.amount);
  }
}

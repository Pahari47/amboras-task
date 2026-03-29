import { Injectable } from '@nestjs/common';
import { EventType } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
  const dow = day.getUTCDay(); // 0 Sun .. 6 Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  day.setUTCDate(day.getUTCDate() + diff);
  return day;
}

function decimalToNumber(value: { toString(): string } | null | undefined): number {
  if (value == null) return 0;
  return Number(value.toString());
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(storeId: string) {
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

  async getTopProducts(storeId: string) {
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

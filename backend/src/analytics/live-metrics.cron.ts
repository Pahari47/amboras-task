import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AnalyticsService } from './analytics.service';

/**
 * Batch job: pre-warms Redis keys for “live” visitor proxy per store.
 * The HTTP handler still works on cache miss (computes from DB).
 */
@Injectable()
export class LiveMetricsCron {
  private readonly logger = new Logger(LiveMetricsCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly analytics: AnalyticsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async refreshLiveSnapshots(): Promise<void> {
    if (!this.redis.isEnabled()) {
      return;
    }
    const stores = await this.prisma.store.findMany({ select: { id: true } });
    await Promise.all(
      stores.map((s) =>
        this.analytics.warmLiveCache(s.id).catch((err: unknown) => {
          this.logger.warn(
            `warmLiveCache failed for ${s.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }),
      ),
    );
  }
}

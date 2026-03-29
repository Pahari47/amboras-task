import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { LiveMetricsCron } from './live-metrics.cron';

@Module({
  imports: [AuthModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, LiveMetricsCron],
})
export class AnalyticsModule {}

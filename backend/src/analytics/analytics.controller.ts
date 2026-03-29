import { Controller, Get, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  getOverview(@CurrentUser() user: RequestUser) {
    return this.analyticsService.getOverview(user.storeId);
  }

  @Get('top-products')
  getTopProducts(@CurrentUser() user: RequestUser) {
    return this.analyticsService.getTopProducts(user.storeId);
  }

  @Get('recent-activity')
  getRecentActivity(@CurrentUser() user: RequestUser) {
    return this.analyticsService.getRecentActivity(user.storeId);
  }

  @Get('live-visitors')
  getLiveVisitors(@CurrentUser() user: RequestUser) {
    return this.analyticsService.getLiveVisitors(user.storeId);
  }
}

export type OverviewResponse = {
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

export type TopProductRow = {
  productId: string;
  revenue: number;
};

export type RecentEventRow = {
  eventId: string;
  eventType: string;
  timestamp: string;
  data: unknown;
  productId: string | null;
  amount: number | null;
  currency: string | null;
};

export type MeResponse = {
  user: {
    userId: string;
    storeId: string;
    email: string;
  };
};

import Stripe from 'stripe';

export interface DateRange {
  start?: number; // Unix timestamp (seconds)
  end: number; // Unix timestamp (seconds)
}

export interface MonthlyBin {
  month: string;
  start: number;
  end: number;
}

export interface KpiResult {
  mrr: number;
  arr: number;
  avgLtv: number;
  churn: number;
  planCounts: { Freelance: number; Studio: number; Agency: number };
  trialFunnel: {
    trialsStarted: number;
    convertedTrials: number;
    cancelledTrials: number;
    activeTrials: number;
    conversionRate: number;
    cpt: number;
    cac: number;
  };
  totalRevenue: number;
  totalCustomers: number;
  totalActiveCustomers: number;
  arpa: number;
  newCustomers: number;
}

export interface DeltaResult {
  mrr: number;
  arr: number;
  avgLtv: number;
  churn: number;
}

export interface CustomerAcquisitionData {
  month: string;
  newCustomers: number;
  churnedCustomers: number;
}

export interface RevenueCustomerData {
  month: string;
  revenue: number;
  customers: number;
}

export interface DashboardResponse {
  data: {
    mrr: number;
    arr: number;
    avgLtv: number;
    churn: number;
    deltas: DeltaResult;
    meta: {
      totalCustomers: number;
      newCustomers: number;
      arpa: number;
      totalRevenue: number;
    };
    trialFunnel: KpiResult['trialFunnel'];
    planCounts: KpiResult['planCounts'];
    customerAcquisitionChart: CustomerAcquisitionData[];
    revenueCustomerChart: RevenueCustomerData[];
  };
}
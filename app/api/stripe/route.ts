// app/api/kpis/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // apiVersion: "2024-06-20",
});

// Utils
function toUnix(dateStr: string) {
  return Math.floor(new Date(dateStr).getTime() / 1000);
}

async function listAllPaidInvoices(startUnix: number, endUnix: number) {
  const out: Stripe.Invoice[] = [];
  let hasMore = true;
  let startingAfter: string | undefined = undefined;

  while (hasMore) {
    const page = await stripe.invoices.list({
      status: "paid",
      created: { gte: startUnix, lte: endUnix },
      limit: 100,
      starting_after: startingAfter,
    });
    out.push(...page.data);
    hasMore = page.has_more;
    if (hasMore) startingAfter = page.data[page.data.length - 1].id;
  }
  return out;
}

async function listAllPrices() {
  const out: Stripe.Price[] = [];
  let hasMore = true;
  let startingAfter: string | undefined = undefined;
  while (hasMore) {
    const page = await stripe.prices.list({
      active: true,
      limit: 100,
      starting_after: startingAfter,
      expand: ["data.product"],
    });
    out.push(...page.data);
    hasMore = page.has_more;
    if (hasMore) startingAfter = page.data[page.data.length - 1].id;
  }
  return out;
}

async function fetchSubscriptionsByIds(ids: string[]) {
  // fetch in parallel but chunk to avoid too many simultaneous calls
  const chunkSize = 20;
  const subs: Stripe.Subscription[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const results = await Promise.all(chunk.map((id) => stripe.subscriptions.retrieve(id)));
    subs.push(...results);
  }
  return subs;
}

/**
 * Get customers who were "paying" at the start of the period.
 * Rule: customer must have paid at least once before start (invoice.status=paid & created < start)
 * and must have had a subscription that existed at or before start (subscription.start_date <= start)
 * and the subscription must not have been canceled before start (canceled_at === null || canceled_at > start)
 */
async function getCustomersAtStart(startUnix: number) {
  const subscriptions = await stripe.subscriptions.list({
    status: "all", // fetch all to filter manually
    expand: ["data.customer"],
  });

  const activeCustomers = new Set<string>();

  for (const sub of subscriptions.data) {
    const hasPaidInvoice = await stripe.invoices.list({
      customer: (sub.customer as Stripe.Customer).id,
      status: "paid",
      limit: 1,
    });

    // Cast to Stripe.Subscription to get typing for current_period_end
    const subscription = sub as Stripe.Subscription;

    if (
      hasPaidInvoice.data.length > 0 &&
      (
        ["active", "past_due"].includes(subscription.status) ||
        (subscription.status === "canceled" &&
          subscription.current_period_end * 1000 >= Date.now())
      )
    ) {
      activeCustomers.add((subscription.customer as Stripe.Customer).id);
    }
  }

  return activeCustomers.size;
}

// ✅ Get first-time paying customers within given month
async function getNewCustomersThisMonth(startUnix: number, endUnix: number) {
  const newCustomers = new Set<string>();

  let hasMore = true;
  let startingAfter: string | undefined = undefined;

  while (hasMore) {
    const invoices = await stripe.invoices.list({
      status: "paid",
      limit: 100,
      created: { gte: startUnix, lte: endUnix },
      starting_after: startingAfter,
    });

    for (const inv of invoices.data) {
      const custId = String(inv.customer);
      // Find first ever paid invoice for this customer
      const firstInvoice = await stripe.invoices.list({
        customer: custId,
        status: "paid",
        limit: 1,
        created: { lte: endUnix },
      });

      if (
        firstInvoice.data.length > 0 &&
        firstInvoice.data[0].created >= startUnix &&
        firstInvoice.data[0].created <= endUnix
      ) {
        newCustomers.add(custId);
      }
    }

    hasMore = invoices.has_more;
    if (hasMore) {
      startingAfter = invoices.data[invoices.data.length - 1].id;
    }
  }

  return newCustomers.size;
}

/**
 * Get churned customers in the period:
 * Customers who had paid before start AND have a subscription that was canceled (canceled_at or ended_at)
 * between start and end.
 */
async function getChurnedCustomers(startUnix: number, endUnix: number) {
  const churned = new Set<string>();

  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const page = await stripe.subscriptions.list({
      status: "all", // get all to catch cancellations manually
      limit: 100,
      starting_after: startingAfter,
      expand: ["data.customer"],
    });

    for (const sub of page.data) {
      const canceledAt = (sub as any).canceled_at ?? sub.canceled_at ?? null;
      const endedAt = (sub as any).ended_at ?? sub.ended_at ?? null;
      const cancelTime = canceledAt || endedAt;

      if (cancelTime && cancelTime >= startUnix && cancelTime <= endUnix) {
        const custId =
          typeof sub.customer === "string"
            ? sub.customer
            : (sub.customer as Stripe.Customer).id;

        // Check if they had any successful payment before cancellation
        const invoices = await stripe.invoices.list({
          customer: custId,
          status: "paid",
          limit: 1,
          created: { lte: cancelTime },
        });

        if (invoices.data.length > 0) {
          churned.add(custId);
        }
      }
    }

    hasMore = page.has_more;
    if (hasMore) startingAfter = page.data[page.data.length - 1].id;
  }

  return Array.from(churned);
}

interface PeriodMetrics {
  customersAtStart: string[];
  newCustomers: string[];
  churnedCustomers: string[];
}

export async function getCustomerMetrics(
  startUnix: number,
  endUnix: number
): Promise<PeriodMetrics> {
  const customersAtStart = new Set<string>();
  const newCustomers = new Set<string>();
  const churnedCustomers = new Set<string>();

  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const subs = await stripe.subscriptions.list({
      status: "all",
      limit: 100,
      starting_after: startingAfter,
      expand: ["data.customer"],
    });

    for (const sub of subs.data) {
      const custId =
        typeof sub.customer === "string"
          ? sub.customer
          : (sub.customer as Stripe.Customer).id;

      const created = sub.start_date;
      const canceledAt = sub.canceled_at ?? null;
      const endedAt = (sub as any).ended_at ?? null;
      const cancelTime = canceledAt || endedAt;

      // ✅ Customers at start
      // Must have paid before start & subscription active at start
      if (created <= startUnix && (!cancelTime || cancelTime > startUnix)) {
        const hasPaidBeforeStart = await stripe.invoices.list({
          customer: custId,
          status: "paid",
          limit: 1,
          created: { lt: startUnix },
        });
        if (hasPaidBeforeStart.data.length > 0) {
          customersAtStart.add(custId);
        }
      }

      // ✅ New customers (first payment in range)
      const firstPaidInvoice = await stripe.invoices.list({
        customer: custId,
        status: "paid",
        limit: 1,
        created: { lte: endUnix },
      });
      if (
        firstPaidInvoice.data.length > 0 &&
        firstPaidInvoice.data[0].created >= startUnix &&
        firstPaidInvoice.data[0].created <= endUnix
      ) {
        newCustomers.add(custId);
      }

      // ✅ Churned customers
      if (cancelTime && cancelTime >= startUnix && cancelTime <= endUnix) {
        const hasPaidBeforeCancel = await stripe.invoices.list({
          customer: custId,
          status: "paid",
          limit: 1,
          created: { lt: cancelTime },
        });
        if (hasPaidBeforeCancel.data.length > 0) {
          churnedCustomers.add(custId);
        }
      }
    }

    hasMore = subs.has_more;
    if (hasMore) {
      startingAfter = subs.data[subs.data.length - 1].id;
    }
  }

  return {
    customersAtStart: Array.from(customersAtStart),
    newCustomers: Array.from(newCustomers),
    churnedCustomers: Array.from(churnedCustomers),
  };
}

export async function getRevenueAndCustomerGrowth(startUnix: number, endUnix: number) {
  // 1) Paid invoices in range
  const paidInvoices = await listAllPaidInvoices(startUnix, endUnix);

  // 2) Extract unique subscription IDs
  const subscriptionIdsSet = new Set<string>();
  for (const inv of paidInvoices) {
    if (inv.subscription) {
      subscriptionIdsSet.add(String(inv.subscription));
    } else if (inv?.lines?.data) {
      for (const line of inv.lines.data as any[]) {
        if (line.subscription) subscriptionIdsSet.add(String(line.subscription));
      }
    }
  }
  const subscriptionIds = Array.from(subscriptionIdsSet);

  // 3) Fetch subscriptions
  const subscriptions =
    subscriptionIds.length > 0 ? await fetchSubscriptionsByIds(subscriptionIds) : [];

  // 4) Paying subscriptions only
  const payingSubs = subscriptions.filter((s) => ["active", "past_due"].includes(s.status));

  // 5) MRR + ARR
  let totalMRR = 0;
  const payingCustomersSet = new Set<string>();

  for (const sub of payingSubs) {
    if (!sub.items?.data) continue;
    if (sub.customer) payingCustomersSet.add(String(sub.customer));

    for (const item of sub.items.data) {
      const price = item.price;
      if (!price?.recurring) continue;

      const unitAmount = (price.unit_amount ?? 0) / 100;
      const qty = item.quantity ?? 1;
      const interval = price.recurring.interval;
      const intervalCount = price.recurring.interval_count ?? 1;

      let contribution = 0;
      if (interval === "month") {
        contribution = (unitAmount / intervalCount) * qty;
      } else if (interval === "year") {
        contribution = (unitAmount / 12 / intervalCount) * qty;
      } else {
        contribution = (unitAmount / intervalCount) * qty;
      }
      totalMRR += contribution;
    }
  }

  const totalARR = totalMRR * 12;

  // 6) Customers at start, churn, new customers
  const { customersAtStart, churnedCustomers, newCustomers } = await getCustomerMetrics(startUnix, endUnix);

  const totalPayingCustomers = payingCustomersSet.size;
  const churnedCount = churnedCustomers.length;
  const customersAtStartCount = churnedCount + totalPayingCustomers;

  const churnRate = customersAtStartCount > 0 ? churnedCount / customersAtStartCount : 0;

  const arpa = totalPayingCustomers > 0 ? totalMRR / totalPayingCustomers : 0;
  const ltv = churnRate > 0 ? arpa / churnRate : arpa * 12;

  return {
    mrr: Number(totalMRR.toFixed(2)),
    arr: Number(totalARR.toFixed(2)),
    arpa: Number(arpa.toFixed(2)),
    ltv: Number(ltv.toFixed(2)),
    churnRate: Number((churnRate * 100).toFixed(2)),
    totalPayingCustomers,
    customersAtStart: customersAtStart.length,
    churnedCustomers: churnedCount,
    newCustomers: newCustomers.length,
    totalPaidSubscriptions: subscriptions.length,
    totalPayingSubscriptionsCount: payingSubs.length,
  };
}

export async function listAllSubscriptions(startDate: number, endDate: number) {
  let allSubscriptions: Stripe.Subscription[] = [];
  let hasMore = true;
  let startingAfter: string | undefined = undefined;

  while (hasMore) {
    const subscriptions = await stripe.subscriptions.list({
      status: "all",
      limit: 100,
      starting_after: startingAfter,
    });

    const filtered = subscriptions.data.filter(sub => {
      const created = sub.created * 1000; // Stripe timestamp → ms
      return created >= startDate && created <= endDate;
    });

    allSubscriptions = [...allSubscriptions, ...filtered];
    hasMore = subscriptions.has_more;
    startingAfter = subscriptions.data.length > 0
      ? subscriptions.data[subscriptions.data.length - 1].id
      : undefined;
  }

  return allSubscriptions;
}

export async function getTrialFunnel(startUnix: number, endUnix: number, adSpend: number = 0) {
  // -------- 7) Trial funnel --------
  async function listAllSubscriptionsInRange(startDate: number, endDate: number) {
    let allSubs: Stripe.Subscription[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;
    while (hasMore) {
      const page = await stripe.subscriptions.list({
        status: "all",
        limit: 100,
        starting_after: startingAfter,
      });
      const filtered = page.data.filter(
        (sub) => sub.created >= startDate && sub.created <= endDate
      );
      allSubs.push(...filtered);
      hasMore = page.has_more;
      if (hasMore) startingAfter = page.data[page.data.length - 1].id;
    }
    return allSubs;
  }

  const allSubsInRange = await listAllSubscriptionsInRange(startUnix, endUnix);

  const allPaidInvoicesEver: Stripe.Invoice[] = [];
  {
    let hasMore = true;
    let startingAfter: string | undefined;
    while (hasMore) {
      const page = await stripe.invoices.list({
        status: "paid",
        limit: 100,
        created: { gte: 0, lte: Math.floor(Date.now() / 1000) },
        starting_after: startingAfter,
      });
      allPaidInvoicesEver.push(...page.data);
      hasMore = page.has_more;
      if (hasMore) startingAfter = page.data[page.data.length - 1].id;
    }
  }
  const payingCustomersEver = new Set<string>(
    allPaidInvoicesEver.map((inv) => String(inv.customer))
  );
  console.log("allSubsInRange.length", allSubsInRange.length)
  const trialsStarted = allSubsInRange.filter(
    (sub) =>
      (sub.trial_start &&
        sub.trial_start >= startUnix &&
        sub.trial_start <= endUnix) ||
      (sub.status === "trialing" &&
        sub.created >= startUnix &&
        sub.created <= endUnix)
  );

  const activeTrials = trialsStarted.filter(
    (sub) =>
      sub.status === "trialing" &&
      sub.trial_end &&
      sub.trial_end > Math.floor(Date.now() / 1000) &&
      !payingCustomersEver.has(String(sub.customer))
  );

  const converted = trialsStarted.filter((sub) =>
    payingCustomersEver.has(String(sub.customer))
  );

  // console.log("payingCustomersEver", payingCustomersEver)
  console.log("converted", converted.length)
  const canceledTrials = trialsStarted.filter(
    (sub) =>
      !payingCustomersEver.has(String(sub.customer)) &&
      (sub.status === "canceled" ||
        (sub.trial_end && sub.trial_end < Math.floor(Date.now() / 1000)))
  );

  const convRate =
    converted.length + canceledTrials.length > 0
      ? (converted.length /
        (converted.length + canceledTrials.length)) *
      100
      : 0;

  return {
    trialsStarted: trialsStarted.length,
    activeTrials: activeTrials.length,
    convertedToPaid: converted.length,
    canceledTrials: canceledTrials.length,
    conversionRate: Number(convRate.toFixed(2)),
    // cac: Number(cac.toFixed(2)),
  };
}



type PlanDistributionResult = {
  plan: string;
  users: number;
  percent: string;
};

/**
 * Calculate plan distribution for active paying users.
 *
 * @param allPaidInvoices - List of all paid invoices (Stripe.Invoice[])
 * @param allSubscriptions - List of all subscriptions (Stripe.Subscription[])
 * @returns Array of { plan, users, percent } breakdown
 */

export async function calculatePlanDistribution(
  stripe: Stripe,
  allPaidInvoices: Stripe.Invoice[],
  allSubscriptions: Stripe.Subscription[]
): Promise<PlanDistributionResult[]> {
  // 1) Collect paying customers (have ≥1 paid invoice)
  const payingCustomerIds = new Set(
    allPaidInvoices.map((inv) => String(inv.customer))
  );

  // 2) Filter active or still-in-billing-period subscriptions of paying customers
  const activeSubscriptions = allSubscriptions.filter((sub) => {
    const isActive = sub.status === "active";
    const stillInPeriod =
      sub.current_period_end && sub.current_period_end * 1000 > Date.now();
    const isPayingCustomer = payingCustomerIds.has(String(sub.customer));
    return isPayingCustomer && (isActive || stillInPeriod);
  });

  // 3) For each paying customer, keep only their most recent active subscription
  const mostRecentActiveSubByCustomer = new Map<string, Stripe.Subscription>();
  activeSubscriptions.forEach((sub) => {
    const custId = String(sub.customer);
    if (!mostRecentActiveSubByCustomer.has(custId)) {
      mostRecentActiveSubByCustomer.set(custId, sub);
    } else {
      const existing = mostRecentActiveSubByCustomer.get(custId)!;
      if ((sub.created ?? 0) > (existing.created ?? 0)) {
        mostRecentActiveSubByCustomer.set(custId, sub);
      }
    }
  });

  // 4) Gather unique product IDs from subscriptions
  const productIds = new Set<string>();
  for (const sub of mostRecentActiveSubByCustomer.values()) {
    const firstItem = sub.items?.data[0];
    const productId = firstItem?.price?.product;
    if (typeof productId === "string") {
      productIds.add(productId);
    }
  }

  // 5) Fetch product details for all product IDs (batch or sequential)
  // Note: Stripe API does not support batch fetch for products, so fetch one by one
  const productIdToName: Record<string, string> = {};
  for (const productId of productIds) {
    try {
      const product = await stripe.products.retrieve(productId);
      productIdToName[productId] = product.name || "Uncategorized";
    } catch (err) {
      productIdToName[productId] = "Uncategorized";
    }
  }

  // 6) Count users by plan name using product names
  const planCounts: Record<string, number> = {};

  for (const sub of mostRecentActiveSubByCustomer.values()) {
    const firstItem = sub.items?.data[0];
    const productId = firstItem?.price?.product;
    let planName = "Uncategorized";

    if (typeof productId === "string" && productIdToName[productId]) {
      planName = productIdToName[productId];
    }

    // Normalize and optionally map plan names to your labels
    const normalizedPlan = planName.toLowerCase();

    const planNameMap: Record<string, string> = {
      freelance: "Freelance",
      studio: "Studio",
      agency: "Agency",
    };

    planName = planNameMap[normalizedPlan] ?? planName;

    planCounts[planName] = (planCounts[planName] || 0) + 1;
  }

  // 7) Calculate total users for percentages
  const totalUsers = Object.values(planCounts).reduce((a, b) => a + b, 0);

  // 8) Format result array with percentages
  const distribution = Object.entries(planCounts).map(([plan, count]) => ({
    plan,
    users: count,
    percent: totalUsers > 0 ? ((count / totalUsers) * 100).toFixed(1) + "%" : "0%",
  }));

  return distribution;
}



export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const startStr = url.searchParams.get("start");
    const endStr = url.searchParams.get("end");

    if (!startStr || !endStr) {
      return NextResponse.json({ error: "Missing start or end (YYYY-MM-DD)" }, { status: 400 });
    }

    const startUnix = toUnix(startStr);
    const endUnix = toUnix(endStr);

    // 1) All paid invoices in range
    const paidInvoices = await listAllPaidInvoices(startUnix, endUnix);

    // 2) Extract subscription IDs (handle both top-level and nested parent)
    const subscriptionIdsSet = new Set<string>();
    for (const inv of paidInvoices) {
      // top-level
      if (inv.subscription) subscriptionIdsSet.add(String(inv.subscription));
      // nested parent.subscription_details.subscription
      else if (inv.parent && (inv.parent as any).subscription_details?.subscription) {
        subscriptionIdsSet.add(String((inv.parent as any).subscription_details.subscription));
      } else if (inv?.lines?.data) {
        // fallback: sometimes invoice.lines[].subscription or invoice.lines[].plan exists
        for (const line of inv.lines.data as any[]) {
          if (line.subscription) subscriptionIdsSet.add(String(line.subscription));
        }
      }
    }
    const subscriptionIds = Array.from(subscriptionIdsSet);

    // 3) Fetch unique subscriptions
    const subscriptions = subscriptionIds.length > 0 ? await fetchSubscriptionsByIds(subscriptionIds) : [];

    // 4) Filter to "paying" subscriptions (status active or past_due)
    const payingSubs = subscriptions.filter((s) => ["active", "past_due"].includes(s.status));

    // 5) Calculate MRR
    let totalMRR = 0;
    const payingCustomersSet = new Set<string>();

    for (const sub of payingSubs) {
      if (!sub.items?.data) continue;
      // track customer as paying if they are present in payingSubs (they have paid invoice linking to sub)
      if (sub.customer) payingCustomersSet.add(String(sub.customer));

      for (const item of sub.items.data) {
        const price = item.price;
        if (!price || !price.recurring) continue; // only recurring prices
        const unitAmount = (price.unit_amount ?? 0) / 100; // dollars
        const qty = item.quantity ?? 1;
        const interval = price.recurring.interval; // "month" | "year" | ...
        const intervalCount = price.recurring.interval_count ?? 1;

        let contribution = 0;
        if (interval === "month") {
          contribution = (unitAmount / intervalCount) * qty;
        } else if (interval === "year") {
          contribution = (unitAmount / 12 / intervalCount) * qty;
        } else {
          // fallback: normalize to monthly assuming intervalCount months
          contribution = (unitAmount / intervalCount) * qty;
        }
        totalMRR += contribution;
      }
    }

    const totalARR = totalMRR * 12;

    // 6) Customers at start, churn, and new customers in one go
    const { customersAtStart, churnedCustomers, newCustomers } = await getCustomerMetrics(startUnix, endUnix);

    const totalPayingCustomers = payingCustomersSet.size;
    const churnedCount = churnedCustomers.length;

    // Customers at start count = churned + still-paying
    const customersAtStartCount = churnedCount + totalPayingCustomers;

    const churnRate = customersAtStartCount > 0
      ? churnedCount / customersAtStartCount
      : 0;

    // 7) LTV
    const arpa = totalPayingCustomers > 0 ? totalMRR / totalPayingCustomers : 0;
    // LTV = ARPA / churnRate ; if churnRate == 0 => cap at 12*ARPA
    const ltv = churnRate > 0 ? arpa / churnRate : arpa * 12;

    // 8) New customers
    // const newCustomersCount = newCustomers.length;

    // const metrics = await getRevenueAndCustomerGrowth(startUnix, endUnix);

    const trialFunnel = await getTrialFunnel(startUnix, endUnix);


    const distribution = await calculatePlanDistribution(stripe, paidInvoices, subscriptions);


    // 8) Plans (prices)
    // const plans = await listAllPrices();
    // Optionally map down to useful fields
    // const mappedPlans = plans.map((p) => ({
    //   id: p.id,
    //   product: (p.product && typeof p.product !== "string") ? { id: p.product.id, name: p.product.name } : p.product,
    //   unit_amount: p.unit_amount,
    //   currency: p.currency,
    //   recurring: p.recurring,
    //   active: p.active,
    // }));

    return NextResponse.json({
      metrics: {
        totalPaidSubscriptions: subscriptions.length,
        totalPayingSubscriptionsCount: payingSubs.length,
        totalPayingCustomers: totalPayingCustomers,
        mrr: Number(totalMRR.toFixed(2)),
        arr: Number(totalARR.toFixed(2)),
        arpa: Number(arpa.toFixed(2)),
        ltv: Number(ltv.toFixed(2)),
        churnRate: Number((churnRate * 100).toFixed(2)), // percent
        customersAtStart: customersAtStart.length,
        churnedCustomers: churnedCount,
        newCustomers: newCustomers.length || "not calculated correctly",
        trialFunnel: trialFunnel,
        distribution,
        // revenueAndCustomer: metrics,
        subscriptionStructure: subscriptions[0],
      },
      // plans: mappedPlans,
    });
  } catch (err: any) {
    console.error("KPI API error:", err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}





// import stripe from '@/lib/stripe'; // Assuming you have this file: export default new Stripe(...)
// import Stripe from "stripe";
// import { NextRequest } from 'next/server';

// // --- TYPE DEFINITIONS (Unchanged) ---
// interface DashboardResponse {
//     data: {
//       mrr: number; arr: number; avgLtv: number; churn: number;
//       deltas: { mrr: number; arr: number; avgLtv: number; churn: number; };
//       meta: { totalCustomers: number; newCustomers: number; arpa: number; totalRevenue: number; };
//       trialFunnel: { trialsStarted: number; convertedToPaid: number; canceledTrials: number; conversionRate: number; };
//       planCounts: Record<string, number>;
//       customerAcquisitionChart: CustomerAcquisitionData[];
//       revenueCustomerChart: RevenueCustomerData[];
//     };
// }
// interface CustomerAcquisitionData { month: string; newCustomers: number; churnedCustomers: number; }
// interface RevenueCustomerData { month: string; revenue: number; customers: number; }
// interface DateRange { start: number; end: number; }
// interface SimpleCharge { customer: string; amount: number; created: number; }
// interface SimpleSubscription {
//     customer: string; status: Stripe.Subscription.Status; created: number; canceled_at: number | null;
//     current_period_end: number; trial_start: number | null;
//     plan: { nickname: string; amount: number; interval: 'month' | 'year' | string; };
// }

// // --- UTILITY & STRIPE HELPER FUNCTIONS (Unchanged) ---

// const getPeriodRange = (start: string, end: string): DateRange => ({
//   start: Math.floor(new Date(start).getTime() / 1000),
//   end: Math.floor(new Date(end).getTime() / 1000),
// });
// const getDelta = (current: number, previous: number) => {
//   if (previous === 0) return current === 0 ? 0 : 100;
//   return Number((((current - previous) / previous) * 100).toFixed(1));
// };
// function getMonthlyBins(start: number, end: number) {
//     const bins: { month: string; start: number; end: number }[] = [];
//     const startDate = new Date(start * 1000);
//     let current = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
//     while (current.getTime() / 1000 < end) {
//       const startOfMonth = Math.floor(current.getTime() / 1000);
//       const monthStr = current.toLocaleString('default', { month: 'short' });
//       current.setUTCMonth(current.getUTCMonth() + 1);
//       const endOfMonth = Math.floor(current.getTime() / 1000 - 1);
//       bins.push({ month: monthStr, start: startOfMonth, end: Math.min(endOfMonth, end) });
//     }
//     return bins;
// }
// async function getAllPaidCharges(range: DateRange): Promise<SimpleCharge[]> {
//   const charges: SimpleCharge[] = [];
//   for await (const charge of stripe.charges.list({ created: { gte: range.start, lte: range.end }, limit: 100 })) {
//     if (charge.paid && charge.customer) {
//       charges.push({ customer: typeof charge.customer === 'string' ? charge.customer : charge.customer.id, amount: charge.amount, created: charge.created });
//     }
//   }
//   return charges;
// }
// // async function getAllSubscriptions(range: { end: number }): Promise<SimpleSubscription[]> {
// //   const subscriptions = await stripe.subscriptions.list({
// //     created: { lte: range.end }, status: 'active', limit: 100, expand: ['data.items.data.price'],
// //   }).autoPagingToArray({ limit: 10000 });
// //   console.log("subscriptions",subscriptions[0])
// //   console.log("subscriptions.length",subscriptions.length)
// //   return subscriptions.map(sub => ({
// //     customer: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
// //     status: sub.status, created: sub.created, canceled_at: sub.canceled_at,
// //     current_period_end: sub.current_period_end, trial_start: sub.trial_start,
// //     plan: {
// //       nickname: sub.items.data[0]?.price?.nickname ?? 'Unknown Plan',
// //       amount: sub.items.data[0]?.price?.unit_amount ?? 0,
// //       interval: sub.items.data[0]?.price?.recurring?.interval ?? 'month',
// //     },
// //   }));
// // }

// async function getAllPaidSubscriptions(range: { end: number }): Promise<SimpleSubscription[]> {
//   const subscriptions = await stripe.subscriptions.list({
//     created: { lte: range.end },
//     status: 'active',
//     limit: 100,
//     expand: ['data.items.data.price', 'data.latest_invoice.payment_intent'],
//   }).autoPagingToArray({ limit: 10000 });

//   const paidSubscriptions = subscriptions.filter(sub => {
//     const invoice = sub.latest_invoice as Stripe.Invoice;
//     const paymentIntent = invoice?.payment_intent as Stripe.PaymentIntent | undefined;

//     return (
//       invoice?.status === 'paid' ||
//       paymentIntent?.status === 'succeeded'
//     );
//   });

//   return paidSubscriptions.map(sub => ({
//     customer: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
//     status: sub.status,
//     created: sub.created,
//     canceled_at: sub.canceled_at,
//     current_period_end: sub.current_period_end,
//     trial_start: sub.trial_start,
//     plan: {
//       nickname: sub.items.data[0]?.price?.nickname ?? 'Unknown Plan',
//       amount: sub.items.data[0]?.price?.unit_amount ?? 0,
//       interval: sub.items.data[0]?.price?.recurring?.interval ?? 'month',
//     },
//   }));
// }


// // --- CORE KPI CALCULATION LOGIC (REWRITTEN & FIXED) ---

// async function calculateKpis(
//   allSubs: SimpleSubscription[],
//   allChargesInHistory: SimpleCharge[],
//   range: DateRange,
//   planFilter: string
// ) {
//   // === Pre-processing ===
//   const allPayingCustomerIds = new Set(allChargesInHistory.map(c => c.customer));
//   const subs = planFilter === 'all'
//     ? allSubs
//     : allSubs.filter(s => s.plan.nickname.toLowerCase().includes(planFilter));

//   // === SECTION 1, 2 & 6: MRR, Total Customers, ARPA, and Plan Distribution ===
//   let mrr = 0;
//   const activePayingCustomers = new Set<string>();
//   const planCounts: Record<string, number> = {};

//   subs.forEach(sub => {
//     if (!allPayingCustomerIds.has(sub.customer)) return; // Must be a paying customer

//     // FIX: Correct "active" logic for Total Customers. A customer is active if they are paying
//     // OR have canceled but their paid-for period has not ended yet (relative to the range).
//     const isActiveAtPeriodEnd = sub.created <= range.end && (
//         ['active', 'past_due'].includes(sub.status) ||
//         (sub.status === 'canceled' && sub.current_period_end > range.end)
//     );

//     if (isActiveAtPeriodEnd && !activePayingCustomers.has(sub.customer)) {
//         activePayingCustomers.add(sub.customer);

//         // Add MRR contribution only from currently recurring subscriptions
//         if (['active', 'past_due'].includes(sub.status)) {
//             const monthlyValue = sub.plan.interval === 'year' ? sub.plan.amount / 12 : sub.plan.amount;
//             mrr += monthlyValue;
//         }

//         // FIX: Count plans for the customers who are correctly identified as active
//         planCounts[sub.plan.nickname] = (planCounts[sub.plan.nickname] || 0) + 1;
//     }
//   });

//   mrr /= 100;
//   const totalCustomers = activePayingCustomers.size; // Accurate total customers
//   const arpa = totalCustomers > 0 ? mrr / totalCustomers : 0;
//   const arr = mrr * 12;

//   // === SECTION 4: Customer Churn Rate ===
//   const payingCustomersAtStart = new Set<string>();
//   subs.forEach(sub => {
//     if (!allPayingCustomerIds.has(sub.customer)) return;
//     const wasActiveAtStart = sub.created < range.start && (!sub.canceled_at || sub.canceled_at >= range.start);
//     if (wasActiveAtStart) payingCustomersAtStart.add(sub.customer);
//   });

//   let churnedInPeriod = 0;
//   payingCustomersAtStart.forEach(customerId => {
//     const sub = subs.find(s => s.customer === customerId); // Find their latest subscription state
//     if (sub?.canceled_at && sub.canceled_at >= range.start && sub.canceled_at <= range.end) {
//       churnedInPeriod++;
//     }
//   });
//   const churnRate = payingCustomersAtStart.size > 0 ? churnedInPeriod / payingCustomersAtStart.size : 0;

//   // === SECTION 3: Lifetime Value (LTV) ===
//   const avgLtv = churnRate > 0 ? arpa / churnRate : arpa * 24;

//   // === SECTION 2 & 6: New Paying Customers ===
//   const firstChargeDateMap = new Map<string, number>();
//   [...allChargesInHistory].sort((a,b) => a.created - b.created).forEach(charge => {
//     if (!firstChargeDateMap.has(charge.customer)) firstChargeDateMap.set(charge.customer, charge.created);
//   });

//   let newCustomers = 0;
//   firstChargeDateMap.forEach((firstChargeDate) => {
//     if (firstChargeDate >= range.start && firstChargeDate <= range.end) newCustomers++;
//   });

//   // === SECTION 4: Total Revenue Collected ===
//   const totalRevenue = allChargesInHistory
//     .filter(c => c.created >= range.start && c.created <= range.end)
//     .reduce((sum, c) => sum + c.amount, 0) / 100;

//   // === SECTION 5: Trial Funnel (FIXED with Cohort-based logic) ===
//   const trialsStartedInPeriod = subs.filter(s => s.trial_start && s.trial_start >= range.start && s.trial_start <= range.end);
//   let convertedToPaid = 0;
//   let canceledTrials = 0;

//   trialsStartedInPeriod.forEach(trialSub => {
//     // Check outcome: Did this trial *ever* lead to a payment?
//     if (allPayingCustomerIds.has(trialSub.customer)) {
//       convertedToPaid++;
//     }
//     // Or did it end as canceled without ever paying?
//     else if (trialSub.status === 'canceled') {
//       canceledTrials++;
//     }
//   });

//   const conversionDenominator = convertedToPaid + canceledTrials;
//   const conversionRate = conversionDenominator > 0 ? (convertedToPaid / conversionDenominator) * 100 : 0;

//   return {
//     mrr, arr, avgLtv, churn: churnRate * 100,
//     totalCustomers, newCustomers, arpa, totalRevenue,
//     trialFunnel: {
//       trialsStarted: trialsStartedInPeriod.length,
//       convertedToPaid,
//       canceledTrials,
//       conversionRate: Number(conversionRate.toFixed(1)),
//     },
//     planCounts,
//   };
// }

// // --- MAIN API ROUTE HANDLER (Unchanged) ---

// async function getAllSubscriptions(range: { end: number }): Promise<{ all: SimpleSubscription[], activePaid: SimpleSubscription[], trialing: SimpleSubscription[], unpaid: SimpleSubscription[], canceled: SimpleSubscription[] }> {
//   const subscriptions = await stripe.subscriptions.list({
//     created: { lte: range.end },
//     limit: 100,
//     expand: ['data.items.data.price', 'data.latest_invoice.payment_intent'],
//   }).autoPagingToArray({ limit: 10000 });

//   const categorized: { all: SimpleSubscription[]; activePaid: SimpleSubscription[]; trialing: SimpleSubscription[]; unpaid: SimpleSubscription[]; canceled: SimpleSubscription[] } = {
//     all: [], activePaid: [], trialing: [], unpaid: [], canceled: []
//   };

//   for (const sub of subscriptions) {
//     const invoice = sub.latest_invoice as Stripe.Invoice;
//     const paymentIntent = invoice?.payment_intent as Stripe.PaymentIntent | undefined;
//     const paid = invoice?.status === 'paid' || paymentIntent?.status === 'succeeded';

//     const mappedSub: SimpleSubscription = {
//       customer: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
//       status: sub.status,
//       created: sub.created,
//       canceled_at: sub.canceled_at,
//       current_period_end: sub.current_period_end,
//       trial_start: sub.trial_start,
//       plan: {
//         nickname: sub.items.data[0]?.price?.nickname ?? 'Unknown Plan',
//         amount: sub.items.data[0]?.price?.unit_amount ?? 0,
//         interval: sub.items.data[0]?.price?.recurring?.interval ?? 'month',
//       },
//     };

//     categorized.all.push(mappedSub);

//     if (sub.status === 'active' && paid) {
//       categorized.activePaid.push(mappedSub);
//     } else if (sub.status === 'trialing') {
//       categorized.trialing.push(mappedSub);
//     } else if (sub.status === 'unpaid') {
//       categorized.unpaid.push(mappedSub);
//     } else if (sub.status === 'canceled') {
//       categorized.canceled.push(mappedSub);
//     }
//   }

//   return categorized;
// }

// export async function GET(request: Request) {
//   const { searchParams } = new URL(request.url);
//   const start = searchParams.get("start");
//   const end = searchParams.get("end");
//   const plan = searchParams.get("plan")?.toLowerCase() || "all";

//   if (!start || !end) {
//     return new Response(JSON.stringify({ error: "Missing start or end date" }), { status: 400 });
//   }

//   const range = getPeriodRange(start, end);
//   const duration = range.end - range.start;
//   const previousRange = {
//     start: Math.max(range.start - duration, 0),
//     end: range.start - 1,
//   };

//   try {
//     const [subCategories, allCharges] = await Promise.all([
//       getAllSubscriptions({ end: range.end }),
//       getAllPaidCharges({ start: 0, end: range.end }),
//     ]);

//     const subsNow = subCategories.activePaid;
//     const subsPrev = subCategories.all.filter(s => s.created <= previousRange.end);
//     const chargesPrev = allCharges.filter(c => c.created <= previousRange.end);

//     const [kpisNow, kpisPrev] = await Promise.all([
//       calculateKpis(subsNow, allCharges, range, plan),
//       calculateKpis(subsPrev, chargesPrev, previousRange, plan),
//     ]);

//     const deltas = {
//       mrr: getDelta(kpisNow.mrr, kpisPrev.mrr),
//       arr: getDelta(kpisNow.arr, kpisPrev.arr),
//       avgLtv: getDelta(kpisNow.avgLtv, kpisPrev.avgLtv),
//       churn: getDelta(kpisNow.churn, kpisPrev.churn),
//     };

//     const monthBins = getMonthlyBins(range.start, range.end);
//     const allPayingCustomerIds = new Set(allCharges.map(c => c.customer));

//     const monthlyData = monthBins.map(({ month, start, end }) => {
//       const newCustomers = subCategories.all.filter(s => s.created >= start && s.created <= end).length;
//       const churnedCustomers = subCategories.canceled.filter(s => s.canceled_at && s.canceled_at >= start && s.canceled_at <= end).length;
//       return { month, newCustomers, churnedCustomers };
//     });

//     const revenueCustomerChart = monthBins.map(({ month, start, end }) => {
//       const monthlyRevenue = allCharges.filter(c => c.created >= start && c.created <= end).reduce((sum, charge) => sum + charge.amount, 0) / 100;
//       const activeCustomers = new Set(subCategories.all.filter(s => allPayingCustomerIds.has(s.customer) && s.created <= end && (['active', 'past_due'].includes(s.status) || (s.status === 'canceled' && s.current_period_end > end))).map(s => s.customer)).size;
//       return { month, revenue: monthlyRevenue, customers: activeCustomers };
//     });

//     return Response.json({
//       data: {
//         mrr: kpisNow.mrr, arr: kpisNow.arr, avgLtv: kpisNow.avgLtv, churn: kpisNow.churn, deltas,
//         meta: { totalCustomers: kpisNow.totalCustomers, newCustomers: kpisNow.newCustomers, arpa: kpisNow.arpa, totalRevenue: kpisNow.totalRevenue },
//         trialFunnel: kpisNow.trialFunnel,
//         planCounts: kpisNow.planCounts,
//         customerAcquisitionChart: monthlyData,
//         revenueCustomerChart,
//       },
//     });
//   } catch (error: unknown) {
//     console.error("Stripe API error:", error);
//     const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
//     return new Response(JSON.stringify({ error: "Failed to load Stripe data", details: errorMessage }), { status: 500 });
//   }
// }

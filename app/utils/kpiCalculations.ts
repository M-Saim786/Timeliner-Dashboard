import Stripe from 'stripe';
import { DateRange, KpiResult } from './types';
import { isInRange } from './utils';
import { getProducts } from './stripeHelpers';

export async function calculateKpis(
    subs: Stripe.Subscription[],
    charges: Stripe.Charge[],
    range: DateRange,
    plan: string
): Promise<KpiResult> {
    let mrr = 0;
    let arr = 0;
    const planCounts = { Freelance: 0, Studio: 0, Agency: 0 };
    const filteredSubs: Stripe.Subscription[] = [];
    let newThisPeriod = 0;

    const productIds = Array.from(new Set(subs.map((s) => s.items.data[0]?.price?.product).filter(Boolean) as string[]));
    const productsMap = await getProducts(productIds);

    for (const sub of subs) {
        const item = sub.items.data[0];
        const price = item?.price;
        const productId = price?.product;
        if (!productId) continue;

        const product = productsMap[productId as string];
        if (!product) continue;

        const name = product.name?.toLowerCase() ?? '';
        if (plan !== 'all' && !name.includes(plan)) continue;

        filteredSubs.push(sub);

        if (name.includes('freelance')) planCounts.Freelance++;
        else if (name.includes('studio')) planCounts.Studio++;
        else if (name.includes('agency')) planCounts.Agency++;

        if (isInRange(sub.created, range)) newThisPeriod++;

        if (sub.status === 'active') {
            const isYearly = price.recurring?.interval === 'year';
            const amount = price.unit_amount || 0;
            const monthly = isYearly ? amount / 12 : amount;
            mrr += monthly;
            const annual = isYearly ? amount : amount * 12;
            arr += annual;
        }
    }

    const trialing = filteredSubs.filter((s) => isInRange(s.trial_start, range));
    const activeTrials = filteredSubs.filter(
        (s) => s.status === 'active' && isInRange(s.trial_start, range) && (s.trial_end || 0) > range.end
    );
    const churned = filteredSubs.filter((s) => s.status === 'canceled' && s.canceled_at && isInRange(s.canceled_at, range));
    const cancelledTrials = filteredSubs.filter(
        (s) =>
            s.status === 'canceled' &&
            // s.trial_start &&
            s.canceled_at &&
            isInRange(s.canceled_at, range) // Only check cancellation in range
    );


    // Debug logs for churned and canceled trials
    console.log('Churned subscriptions:', churned.map(s => ({
        id: s.id,
        status: s.status,
        trial_start: s.trial_start ? new Date(s.trial_start * 1000) : null,
        canceled_at: s.canceled_at ? new Date(s.canceled_at * 1000) : null,
    })));
    console.log('Canceled trials:', cancelledTrials.map(s => ({
        id: s.id,
        status: s.status,
        trial_start: s.trial_start ? new Date(s.trial_start * 1000) : null,
        canceled_at: s.canceled_at ? new Date(s.canceled_at * 1000) : null,
    })));


    const convertedFromThisPeriod = activeTrials.filter((s) => isInRange(s.trial_start, range));
    const conversionRate = trialing.length > 0 ? (convertedFromThisPeriod.length / trialing.length) * 100 : 0;
    const churnRateDenominator = activeTrials.length + churned.length;
    const churnRate = churnRateDenominator > 0 ? churned.length / churnRateDenominator : 0;

    const totalRevenue = charges.reduce((sum, c) => sum + c.amount, 0) / 100;
    const totalActiveCustomers = activeTrials.length || 1;
    const arpa = mrr / 100 / totalActiveCustomers;
    const avgLtv = churnRate > 0 ? arpa / churnRate : 0;

    return {
        mrr: mrr / 100,
        arr: arr,
        avgLtv,
        churn: churnRate * 100,
        planCounts,
        trialFunnel: {
            trialsStarted: trialing.length,
            convertedTrials: convertedFromThisPeriod.length,
            cancelledTrials: cancelledTrials.length,
            activeTrials: activeTrials.length,
            conversionRate: Number(conversionRate.toFixed(1)),
            cpt: 0,
            cac: 0,
        },
        totalRevenue,
        totalCustomers: filteredSubs.length,
        totalActiveCustomers: activeTrials.length,
        arpa,
        newCustomers: newThisPeriod,
    };
}
import Stripe from 'stripe';
import { DateRange } from './types';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
//   apiVersion: '2024-09-30.acacia',
});

export async function getAllCharges(range: DateRange): Promise<Stripe.Charge[]> {
  try {
    let allCharges: Stripe.Charge[] = [];
    let hasMore: boolean = true;
    let startingAfter: string | null = null;

    while (hasMore) {
      const params: Stripe.ChargeListParams = {
        created: { gte: range.start, lte: range.end },
        limit: 100,
      };

      if (startingAfter) {
        params.starting_after = startingAfter;
      }

      const charges: Stripe.ApiList<Stripe.Charge> = await stripe.charges.list(params);
      allCharges = allCharges.concat(charges.data);
      hasMore = charges.has_more;
      startingAfter = charges.data[charges.data.length - 1]?.id ?? null;
    }

    return allCharges;
  } catch (error: unknown) {
    console.error('Error fetching charges:', error);
    throw error;
  }
}

export async function getAllSubscriptions(range: DateRange): Promise<Stripe.Subscription[]> {
  try {
    let allSubscriptions: Stripe.Subscription[] = [];
    let hasMore: boolean = true;
    let startingAfter: string | null = null;

    while (hasMore) {
      const params: Stripe.SubscriptionListParams = {
        status: 'all',
        created: { lte: range.end },
        limit: 100,
      };

      if (startingAfter) {
        params.starting_after = startingAfter;
      }

      const subscriptions: Stripe.ApiList<Stripe.Subscription> = await stripe.subscriptions.list(params);
      allSubscriptions = allSubscriptions.concat(subscriptions.data);
      hasMore = subscriptions.has_more;
      startingAfter = subscriptions.data[subscriptions.data.length - 1]?.id ?? null;
    }

    return allSubscriptions;
  } catch (error: unknown) {
    console.error('Error fetching subscriptions:', error);
    throw error;
  }
}

export async function getProducts(productIds: string[]): Promise<Record<string, Stripe.Product>> {
  const productsMap: Record<string, Stripe.Product> = {};
  await Promise.all(
    productIds.map(async (id) => {
      try {
        const product = await stripe.products.retrieve(id);
        productsMap[id] = product;
      } catch (e) {
        console.warn('Failed to fetch product:', id);
      }
    })
  );
  return productsMap;
}
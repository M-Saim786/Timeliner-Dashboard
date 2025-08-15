// app/api/data/route.js

import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function getAllStripeData(method, params = {}) {
    let results = [];
    let hasMore = true;
    let startingAfter = undefined;

    while (hasMore) {
        const response = await method({
            ...params,
            limit: 100,
            starting_after: startingAfter,
        });

        results = results.concat(response.data);
        hasMore = response.has_more;
        if (hasMore) {
            startingAfter = response.data[response.data.length - 1].id; // tracks the id of the last object in array to start from After that ID
        }
    }
    return results;
}

export async function GET(req: NextRequest) {
    if (!process.env.STRIPE_SECRET_KEY) {
        return NextResponse.json({ error: { message: 'Stripe API Key not configured' } }, { status: 500 });
    }

    const searchParams = new URL(req.url).searchParams;
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    const selectedPlan = searchParams.get('plan') || 'all';
    // Fix timezone handling - ensure dates are processed correctly
    const startDate = new Date(start + 'T00:00:00.000Z');
    const endDate = new Date(end + 'T23:59:59.999Z');
    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const endTimestamp = Math.floor(endDate.getTime() / 1000);

    console.log("start:", start, " end:", end, "selectedPlan: ", selectedPlan);
    console.log("startTimestamp:", startTimestamp, "endTimestamp:", endTimestamp);
    console.log("startDate:", new Date(startTimestamp * 1000).toISOString(), "endDate:", new Date(endTimestamp * 1000).toISOString());
    // In a real app, protect this endpoint (e.g., check for admin session)
    // if (!isAdmin) { return NextResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 }); }

    try {
        // --- 1. FETCH RAW DATA FROM STRIPE ---
        // Fetch all subscriptions and paid invoices in parallel for efficiency.
        // Expand data to get customer and product details without extra API calls.
        const [allSubscriptions, allPaidInvoices] = await Promise.all([
            getAllStripeData(
                (params) => stripe.subscriptions.list(params),
                {
                    status: 'all',
                    expand: ['data.customer', 'data.items.data.price'], // only expand this far
                    created: {
                        gte: startTimestamp,
                        lte: endTimestamp
                    }
                }
            ),
            getAllStripeData(
                (params) => stripe.invoices.list(params),
                {
                    status: 'paid',
                    // created: {
                    //     gte: startTimestamp,
                    //     lte: endTimestamp
                    // }
                }
            ),
        ]);
        console.log("allSubscriptions:", allSubscriptions.length)
        console.log("allPaidInvoices:", allPaidInvoices.length)
        const invoicesWithPayments = allPaidInvoices.filter(invoice => invoice.total > 0.00);
        console.log("invoicesWithPayments", invoicesWithPayments.length)
        // Enrich prices with product info
        for (const sub of allSubscriptions) {
            for (const item of sub.items.data) {
                if (typeof item.price.product === 'string') {
                    const product = await stripe.products.retrieve(item.price.product);
                    item.price.product = product;
                }
            }
        }

        // ✅ NEW: EXTRACT ALL AVAILABLE PLAN NAMES FOR THE FRONTEND FILTER
        const allPlanNames = new Set();
        allSubscriptions.forEach(sub => {
            sub.items.data.forEach(item => {
                // Use optional chaining for safety, in case product is not expanded or doesn't have a name
                const planName = item.price.product?.name;
                if (planName) {
                    allPlanNames.add(planName);
                }
            });
        });

        // --- 2. IDENTIFY PAYING CUSTOMERS ---
        // A customer is "paying" if they have at least one successful invoice.
        const paidCustomerIds = new Set(allPaidInvoices.map(invoice => invoice.customer));

        console.log("paidCustomerIds", paidCustomerIds.size);
        // --- 3. CALCULATE METRICS ---

        const now = new Date();
        // startDate and endDate are already defined above with proper timezone handling

        // SECTION 1 & 2: Core Revenue & Summary Stats
        let mrr = 0;
        let activePayingCustomers = 0;
        const planDistribution = {};
        const activeCustomerIds = new Set();

        let payingSubscriptions = allSubscriptions.filter(sub => {
            const isPaidCustomer = paidCustomerIds.has(sub.customer.id);
            const isActiveOrPastDue = ['active', 'past_due'].includes(sub.status);
            const isCanceledButActive = sub.status === 'canceled' && sub.current_period_end * 1000 >= now.getTime();
            return isPaidCustomer && (isActiveOrPastDue || isCanceledButActive);
        });
        console.log("payingSubscriptions", payingSubscriptions.length)

        if (selectedPlan !== 'all') {
            payingSubscriptions = payingSubscriptions.filter(sub => {
                return sub.items.data?.some(item => {
                    const product = item.price.product;
                    return product && product.name === selectedPlan;
                });
            });
        }

        payingSubscriptions.forEach(sub => {
            // activePayingCustomers++;
            activeCustomerIds.add(sub.customer.id); // Collect unique customer IDs

            // console.log("sub.items.data", sub.items.data.length)
            sub.items.data.forEach(item => {

                const price = item.price;

                const monthlyCost = price.recurring.interval === 'year'
                    ? price.unit_amount / 12
                    : price.unit_amount;
                // console.log("price.recurring.interval", price.recurring.interval)
                console.log(`monthlyCost: ${monthlyCost} cents = $${(monthlyCost / 100).toFixed(2)} - Plan: ${price.recurring.interval}`)

                mrr += monthlyCost;


                // For Plan Distribution
                const product = price.product;
                const planName = product ? product.name || 'Unnamed Plan' : 'Unnamed Plan';
                planDistribution[planName] = (planDistribution[planName] || 0) + 1;

            });
            // const price = sub.items.data[0].price;
            // const monthlyCost = price.recurring.interval === 'year'
            //     ? price.unit_amount / 12
            //     : price.unit_amount;
            // console.log("price.recurring.interval", price.recurring.interval)


            // mrr += monthlyCost;

            // // For Plan Distribution (Section 6)
            // const product = sub.items.data[0].price.product;
            // const planName = product ? product.name || 'Unnamed Plan' : 'Unnamed Plan';
            // planDistribution[planName] = (planDistribution[planName] || 0) + 1;
        });
        activePayingCustomers = activeCustomerIds.size;
        console.log("Total Customers:", activePayingCustomers);

        console.log(`\n=== MRR SUMMARY ===`);
        console.log(`Total MRR (cents): ${mrr}`);
        console.log(`Total MRR (dollars): $${(mrr / 100).toFixed(2)}`);
        console.log(`Expected from transactions: ~$495`);
        console.log(`========================`);

        mrr /= 100; // Convert from cents to dollars

        const arr = mrr * 12;
        const arpa = activePayingCustomers > 0 ? mrr / activePayingCustomers : 0;

        // SECTION 2: New Customers This Month
        // Find the first paid invoice for each customer
        const firstInvoiceDateByCustomer = {};
        allPaidInvoices.sort((a, b) => a.created - b.created).forEach(invoice => {
            if (!firstInvoiceDateByCustomer[invoice.customer]) {
                firstInvoiceDateByCustomer[invoice.customer] = new Date(invoice.created * 1000);
            }
        });
        console.log("Length of firstInvoiceDateByCustomer:", Object.keys(firstInvoiceDateByCustomer).length);
        console.log("allPaidInvoices:", allPaidInvoices.length);
        console.log("startDate", startDate, "endDte", endDate);
        let newThisMonth = 0;
        let newThisPeriod = 0;
        for (const customerId in firstInvoiceDateByCustomer) {
            const firstDate = firstInvoiceDateByCustomer[customerId];
            // console.log("firstDate", firstDate)
            if (firstDate >= startDate && firstDate <= endDate) {
                // newThisMonth++;
                newThisPeriod++;
            }
        }
        console.log("newThisPeriod", newThisPeriod)

        // SECTION 1: Churn Rate (for the period)
        const churnedInPeriod = allSubscriptions.filter(sub => {
            const isPaidCustomer = paidCustomerIds.has(sub.customer.id);
            const isCanceled = sub.status === 'canceled';
            const canceledDate = sub.canceled_at ? new Date(sub.canceled_at * 1000) : null;
            const inDateRange = canceledDate && canceledDate >= startDate && canceledDate <= endDate;

            // console.log("----- Subscription Check -----");
            // console.log("Customer ID:", sub.customer.id);
            // console.log("Paid Customer?:", isPaidCustomer);
            // console.log("Status:", sub.status);
            // console.log("Canceled At:", canceledDate);
            // console.log("In Date Range?:", inDateRange);

            return isPaidCustomer && isCanceled && inDateRange;
        }).length;

        console.log("Churned in period count:", churnedInPeriod);

        // Denominator for churn: Active customers at the start of the period
        // Proxy: Current Active Customers + Customers who churned in the period
        console.log("activePayingCustomers:", activePayingCustomers)
        const customersAtStartOfPeriod = activePayingCustomers + churnedInPeriod;
        console.log("customersAtStartOfPeriod:", customersAtStartOfPeriod)
        const churnRate = customersAtStartOfPeriod > 0 ? (churnedInPeriod / customersAtStartOfPeriod) : 0;
        console.log("churnRate", churnRate)
        // SECTION 1: LTV
        // Avoid division by zero if churn is 0
        const ltv = churnRate > 0 ? arpa / churnRate : arpa * 24; // Capping at 24x ARPA for new businesses

        // SECTION 4: Total Revenue Collected (Cash In) This Period
        const revenueThisMonth = allPaidInvoices
            .filter(invoice => {
                const createdDate = new Date(invoice.created * 1000);
                return createdDate >= startDate && createdDate <= endDate;
            })
            .reduce((sum, invoice) => sum + invoice.amount_paid, 0) / 100;
        console.log("revenueThisMonth", revenueThisMonth)
        // SECTION 5: Trial Funnel (using all-time data for conversion rate)
        // SECTION 5: Trial Funnel
        console.log("allSubscriptions.length", allSubscriptions.length)
        const notTrials = allSubscriptions.filter(sub => sub.status != "trialing" || sub.status !== "active");
        console.log(" notTrials", notTrials.length)
        // Get all customers who have at least 1 paid invoice
        const paidCustomerIdsGreater0 = new Set(allPaidInvoices.filter(inv => inv.total > 0.00).map(inv => inv.customer));

        const trials = allSubscriptions.filter(sub => {
            const trialStartDate = new Date(sub.trial_start * 1000);
            const isWithinRange = trialStartDate >= startDate && trialStartDate <= endDate;

            // console.log("------ Trial Subscription Check ------");
            // console.log("Customer ID:", sub.customer?.id);
            // console.log("Trial Start Date:", trialStartDate);
            // console.log("Within Range?:", isWithinRange);
            // console.log("--------------------------------------");

            return sub.trial_start && isWithinRange;
        });

        console.log("Total Trials Found:", trials.length);

        // 1. Trials Started
        const trialsStarted = trials.length;

        // 2. Active Trials — never paid yet
        const activeTrials = trials.filter(sub =>
            sub.status === 'trialing' &&
            new Date(sub.trial_end * 1000) > now &&
            !paidCustomerIdsGreater0.has(sub.customer.id)
        ).length;

        // 3. Converted to Paid — started trial & have paid invoice
        const convertedTrials = trials.filter(sub =>
            paidCustomerIdsGreater0.has(sub.customer.id)
        ).length;

        // 4. Canceled Trials — started trial, never paid, ended or expired
        const canceledTrials = trials.filter(sub =>
            !paidCustomerIdsGreater0.has(sub.customer.id) &&
            ['canceled', 'incomplete_expired'].includes(sub.status)
        ).length;

        // Status breakdown just for debug
        const statusBreakdown = trials.reduce((acc, sub) => {
            acc[sub.status] = (acc[sub.status] || 0) + 1;
            return acc;
        }, {});

        console.log("Trial Status Breakdown:", statusBreakdown);
        console.log("Trials Started:", trialsStarted);
        console.log("Active Trials:", activeTrials);
        console.log("Converted Trials:", convertedTrials);
        console.log("Canceled Trials:", canceledTrials);

        // 5. Conversion rate
        const trialConversionRate = (convertedTrials + canceledTrials) > 0
            ? convertedTrials / (convertedTrials + canceledTrials)
            : 0;

        console.log("Trial Conversion Rate:", (trialConversionRate * 100).toFixed(2) + "%");


        // =================================================================
        // === NEW: LOGIC FOR CUSTOMER ACQUISITION CHART (SECTION 3 & 6) ===
        // =================================================================
        const customerAcquisitionChartData = [];
        const monthlyNewCustomers = {};
        const monthlyChurnedCustomers = {};

        // 1. Tally new customers by month
        for (const customerId in firstInvoiceDateByCustomer) {
            const date = firstInvoiceDateByCustomer[customerId];
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; // Format: YYYY-MM
            monthlyNewCustomers[monthKey] = (monthlyNewCustomers[monthKey] || 0) + 1;
        }

        // 2. Tally churned customers by month (ensuring no double counting)
        const churnedSubs = allSubscriptions.filter(sub =>
            paidCustomerIds.has(sub.customer.id) && sub.status === 'canceled' && sub.canceled_at
        );
        const monthlyChurnedCustomerIds = {}; // Use a Set to avoid double counting a user who cancels multiple subs in a month
        for (const sub of churnedSubs) {
            const date = new Date(sub.canceled_at * 1000);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlyChurnedCustomerIds[monthKey]) {
                monthlyChurnedCustomerIds[monthKey] = new Set();
            }
            monthlyChurnedCustomerIds[monthKey].add(sub.customer.id);
        }
        for (const monthKey in monthlyChurnedCustomerIds) {
            monthlyChurnedCustomers[monthKey] = monthlyChurnedCustomerIds[monthKey].size;
        }

        // 3. Generate month buckets for the chart and assemble the data
        let currentMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        while (currentMonth <= endDate) {
            const monthKey = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
            const monthLabel = currentMonth.toLocaleString('default', { month: 'short', year: 'numeric' });

            customerAcquisitionChartData.push({
                month: monthLabel,
                new: monthlyNewCustomers[monthKey] || 0,
                churned: monthlyChurnedCustomers[monthKey] || 0,
            });

            currentMonth.setMonth(currentMonth.getMonth() + 1);
        }


        // =================================================================
        // === NEW: REVENUE & CUSTOMER GROWTH CHART (HISTORICAL)         ===
        // =================================================================
        const revenueCustomerChartData = [];
        let monthIterator = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

        while (monthIterator <= endDate) {
            const monthEndDate = new Date(monthIterator.getFullYear(), monthIterator.getMonth() + 1, 0, 23, 59, 59);
            const monthLabel = monthIterator.toLocaleString('default', { month: 'short', year: 'numeric' });

            let monthlyMRR = 0;
            const monthlyCustomers = new Set();

            for (const sub of allSubscriptions) {
                // Rule: Only count subscriptions from customers who have paid at least once.
                if (!paidCustomerIds.has(sub.customer.id || sub.customer)) continue;

                const createdDate = new Date(sub.created * 1000);
                const canceledDate = sub.canceled_at ? new Date(sub.canceled_at * 1000) : null;

                // Rule: The subscription must have been created before the end of the month we are looking at,
                // AND it must either be still active (not canceled) OR was canceled after the end of that month.
                // This correctly captures the "active state" at a point in time.
                let subscriptionCount = 0;
                if (createdDate <= monthEndDate && (!canceledDate || canceledDate > monthEndDate)) {
                    const price = sub.items.data[0].price;
                    const monthlyCost = price.recurring.interval === 'year'
                        ? price.unit_amount / 12
                        : price.unit_amount;

                    //print monthlyCost with item.price.product.name and sub.customer.id

                    

                    console.log("monthlyCost", monthlyCost, "product.name", price.product.name);
                    subscriptionCount++;


                    monthlyMRR += monthlyCost;
                    monthlyCustomers.add(sub.customer.id || sub.customer);
                }
            }

            revenueCustomerChartData.push({
                month: monthLabel,
                revenue: monthlyMRR / 100, // Convert from cents
                customers: monthlyCustomers.size,
            });

            monthIterator.setMonth(monthIterator.getMonth() + 1);
        }



        // --- 4. ASSEMBLE FINAL RESPONSE ---
        return NextResponse.json({
            section1_revenue_retention: {
                mrr: { value: mrr, description: "Monthly Recurring Revenue" },
                arr: { value: arr, description: "Annual Recurring Revenue" },
                ltv: { value: ltv, description: "Customer Lifetime Value" },
                customerChurnRate: { value: churnRate, description: "Customer Churn Rate (%)", period: `From ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}` }
            },
            section2_summary_stats: {
                arpa: { value: arpa, description: "Average Revenue Per Account" },
                totalCustomers: { value: activePayingCustomers, description: "Currently active, paying customers" },
                newThisPeriod: { value: newThisPeriod, description: "First-time paying users in the period" },
            },
            section3_and_6_growth: {
                // NOTE: This shows *current* numbers. True historical graphs require a data warehouse.
                // currentMonthSnapshot: {
                //     mrr,
                //     customers: activePayingCustomers,
                //     newCustomers: newThisMonth,
                //     // Churned customers are harder to attribute to a specific month without event processing
                //     churnedCustomers: churnedInPeriod,
                // },
                planDistribution: {
                    ...planDistribution,
                    total: activePayingCustomers
                },
                // ✅ ADDED: The new chart data is included here
                customerAcquisitionChart: customerAcquisitionChartData,
                // ✅ ADDED: The new chart data is included here
                revenueCustomerChart: revenueCustomerChartData,
            },
            section4_cash_flow: {
                revenueCollectedThisMonth: { value: revenueThisMonth, description: "Actual cash collected in the period" },
            },
            section5_trial_funnel: {
                trialsStarted: { value: trialsStarted, description: "Total trials ever started" },
                activeTrials: { value: activeTrials, description: "Users currently in an active trial" },
                convertedToPaid: { value: convertedTrials, description: "Trials that became paying customers" },
                canceledTrials: { value: canceledTrials, description: "Trials that ended without payment" },
                conversionRate: { value: trialConversionRate, description: "Converted / (Converted + Canceled)" }
            },
            availablePlans: Array.from(allPlanNames),
        }, { status: 200 });

    } catch (error) {
        console.error("Stripe API Error:", error.message);
        return NextResponse.json({ error: { message: error.message } }, { status: 500 });
    }
}
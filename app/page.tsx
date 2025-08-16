"use client"

import { useState, useEffect, lazy, Suspense, useCallback, useRef } from "react"
import {
  TrendingUp,
  TrendingDown,
  Users,
  DollarSign,
  Target,
  UserCheck,
  BarChart3,
  Zap,
  CheckCircle, Clock, XCircle
} from "lucide-react"
import debounce from "lodash.debounce";

// --- LAZY LOADED COMPONENTS (NO CHANGES NEEDED HERE) ---
const Card = lazy(() => import("@/components/ui/card").then(m => ({ default: m.Card })));
const CardContent = lazy(() => import("@/components/ui/card").then(m => ({ default: m.CardContent })));
const CardDescription = lazy(() => import("@/components/ui/card").then(m => ({ default: m.CardDescription })));
const CardHeader = lazy(() => import("@/components/ui/card").then(m => ({ default: m.CardHeader })));
const CardTitle = lazy(() => import("@/components/ui/card").then(m => ({ default: m.CardTitle })));
const Select = lazy(() => import("@/components/ui/select").then(m => ({ default: m.Select })));
const SelectContent = lazy(() => import("@/components/ui/select").then(m => ({ default: m.SelectContent })));
const SelectItem = lazy(() => import("@/components/ui/select").then(m => ({ default: m.SelectItem })));
const SelectTrigger = lazy(() => import("@/components/ui/select").then(m => ({ default: m.SelectTrigger })));
const SelectValue = lazy(() => import("@/components/ui/select").then(m => ({ default: m.SelectValue })));
const Badge = lazy(() => import("@/components/ui/badge").then(m => ({ default: m.Badge })));
const Table = lazy(() => import("@/components/ui/table").then(m => ({ default: m.Table })));
const TableBody = lazy(() => import("@/components/ui/table").then(m => ({ default: m.TableBody })));
const TableCell = lazy(() => import("@/components/ui/table").then(m => ({ default: m.TableCell })));
const TableHead = lazy(() => import("@/components/ui/table").then(m => ({ default: m.TableHead })));
const TableHeader = lazy(() => import("@/components/ui/table").then(m => ({ default: m.TableHeader })));
const TableRow = lazy(() => import("@/components/ui/table").then(m => ({ default: m.TableRow })));
import { DatePickerWithRange } from "@/components/date-range-picker"
import { RevenueChart } from "@/components/revenue-chart"
import { CustomerAcquisitionChart } from "@/components/customer-acquisition-chart"
import { PlanSplitChart } from "@/components/plan-split-chart"
import { TrialFunnelChart } from "@/components/trial-funnel-chart"
import { ThemeToggle } from "@/components/theme-toggle"
import LoadingSpinner from "@/components/loading-spinner"
// --- END LAZY LOADED COMPONENTS ---

// Mock data for sections not yet powered by API
const mockData = {
  affiliates: [
    { name: "Sarah Chen", email: "sarah@example.com", subs: 24, mrr: 2880, commission: 20, payouts: 576, pending: 144 },
    { name: "Mike Johnson", email: "mike@example.com", subs: 18, mrr: 2160, commission: 15, payouts: 324, pending: 108 },
  ],
  satisfaction: {
    csat: 4.2, nps: 42, submissions: 156, topComplaints: ["Slow loading times", "Limited integrations", "Pricing concerns"],
  },
}

export default function Dashboard() {
  const [planFilter, setPlanFilter] = useState("all")
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null); // Initialize as null
  const [stripeData, setStripeData] = useState(null);
  const [loading, setLoading] = useState(true);

  // 🔁 Non-debounced fetch for first load or manual use
  const fetchStripeData = async ({ start, end, plan }: { start: string; end: string; plan: string }) => {
    setLoading(true)
    try {
      // Corrected API endpoint
      const res = await fetch(`/api/data?start=${start}&end=${end}&plan=${plan}`)
      if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
      const json = await res.json()
      // ✅ CORRECT: Set the entire JSON response to state
      setStripeData(json)
    } catch (err) {
      console.error("Error fetching Stripe data", err)
      setStripeData(null); // Clear data on error
    } finally {
      setLoading(false)
    }
  }

  // 🕒 Debounced version for filters
  const debouncedFetchRef = useRef<ReturnType<typeof debounce> | null>(null)
  useEffect(() => {
    debouncedFetchRef.current = debounce(fetchStripeData, 500)
    return () => debouncedFetchRef.current?.cancel()
  }, [])

  // ✅ Call normal fetch on first load
  useEffect(() => {
    const today = new Date()
    const last30 = new Date(today)
    last30.setDate(today.getDate() - 30)
    const start = last30.toISOString().split("T")[0]
    const end = today.toISOString().split("T")[0]

    setDateRange({ start, end }) // Set initial date range state
    fetchStripeData({ start, end, plan: 'all' })
  }, []) // Empty dependency array ensures this runs only once on mount

  // 👇 Event handlers for filters
  const handleDateChange = useCallback(
    (range: { start: string; end: string } | null) => {
      if (range?.start && range?.end) {
        setDateRange({ start: range.start, end: range.end })
        if (debouncedFetchRef.current) {
          debouncedFetchRef.current({ start: range.start, end: range.end, plan: planFilter })
        }
      } else {
        setDateRange(null)
      }
    },
    [planFilter]
  )

  const handlePlanChange = useCallback(
    (newPlan: string) => {
      setPlanFilter(newPlan)
      if (dateRange && debouncedFetchRef.current) {
        debouncedFetchRef.current({ start: dateRange.start, end: dateRange.end, plan: newPlan })
      }
    },
    [dateRange]
  )

  const formatCurrency = (value) =>
    new Intl.NumberFormat("en-US", {
      style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(value);

  const formatDelta = (delta, trend) => {
    // Placeholder as API doesn't provide deltas yet
    const Icon = trend === "up" ? TrendingUp : TrendingDown;
    const color = trend === "up" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
    return (
      <div className={`flex items-center gap-1 text-sm ${color}`}>
        <Icon className="h-3 w-3" />
        {Math.abs(delta)}%
      </div>
    );
  };

  if (loading) return <div className="flex h-screen items-center justify-center"><LoadingSpinner /></div>;
  if (!stripeData) return <div className="flex h-screen items-center justify-center">Error loading data. Please try again later.</div>;

  // ✅ CORRECT MAPPING: Map API response to the structure the component expects
  const kpiData = {
    mrr: {
      value: stripeData.section1_revenue_retention?.mrr?.value ?? 0,
      delta: 0, // Placeholder
      trend: "up", // Placeholder
    },
    arr: {
      value: stripeData.section1_revenue_retention?.arr?.value ?? 0,
      delta: 0,
      trend: "up",
    },
    avgLtv: {
      value: stripeData.section1_revenue_retention?.ltv?.value ?? 0,
      delta: 0,
      trend: "down",
    },
    churn: {
      // ✅ CORRECT: Multiply by 100 for percentage display
      value: (stripeData.section1_revenue_retention?.customerChurnRate?.value ?? 0) * 100,
      delta: 0,
      trend: "down",
    },
  };

  // ✅ CORRECT MAPPING & TRANSFORMATION: Convert plan distribution object to array for charting/mapping
  const planDistributionData = stripeData.section3_and_6_growth?.planDistribution
    ? Object.entries(stripeData.section3_and_6_growth.planDistribution)
      .filter(([key]) => key !== 'total') // Exclude the total count
      .map(([name, value]) => ({ name, value }))
    : [];

  const planDistributionForText = stripeData.section3_and_6_growth?.planDistribution
    ? Object.entries(stripeData.section3_and_6_growth.planDistribution)
      .filter(([key]) => key !== 'total')
      .map(([plan, users]) => ({ plan, users }))
    : [];

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto p-6 space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-y-4 md:gap-y-0">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Dashboard</h1>
              <p className="text-muted-foreground text-sm sm:text-base">Business performance at a glance</p>
            </div>
            <div className="flex flex-wrap md:flex-nowrap items-center gap-4">
              <ThemeToggle />
              <DatePickerWithRange value={dateRange} onChange={handleDateChange} />
              <Select value={planFilter} onValueChange={handlePlanChange}>
                <SelectTrigger className="w-[160px] sm:w-[180px]">
                  <SelectValue placeholder="Plan Filter" />
                </SelectTrigger>
                <SelectContent>

                  <SelectItem value="all">All Plans</SelectItem>
                  {stripeData?.availablePlans && stripeData?.availablePlans.map((plan) => (
                    <SelectItem value={plan}>{plan}</SelectItem>
                  ))}
                  {/* <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem> */}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Top KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {Object.entries(kpiData).map(([key, val]) => (
              <Card className="bg-card" key={key}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{key.toUpperCase()}</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {key === "churn" ? `${val.value.toFixed(2)}%` : formatCurrency(val.value)}
                  </div>
                  {/* Delta display is a placeholder */}
                  <p className="text-xs text-muted-foreground">For the selected period</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Section 2: Summary Stats */}
          <Card className="bg-card">
            <CardHeader>
              <CardTitle>ARPA, Total Customers, New This Period</CardTitle>
              <CardDescription>Only include paying users (at least one successful invoice)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex justify-between items-center p-4 border rounded-lg bg-muted/50">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total Active Customers</p>
                    <p className="text-2xl font-bold">{stripeData.section2_summary_stats?.totalCustomers?.value?.toLocaleString() ?? 'N/A'}</p>
                  </div>
                  <Users className="h-8 w-8 text-blue-500" />
                </div>
                <div className="flex justify-between items-center p-4 border rounded-lg bg-muted/50">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">New Customers (Period)</p>
                    <p className="text-2xl font-bold">{stripeData.section2_summary_stats?.newThisPeriod?.value?.toLocaleString() ?? 'N/A'}</p>
                  </div>
                  <UserCheck className="h-8 w-8 text-green-500" />
                </div>
                <div className="flex justify-between items-center p-4 border rounded-lg bg-muted/50">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">ARPA</p>
                    <p className="text-2xl font-bold">{formatCurrency(stripeData.section2_summary_stats?.arpa?.value ?? 0)}</p>
                  </div>
                  <DollarSign className="h-8 w-8 text-emerald-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* These charts can be uncommented once you implement historical data fetching */}
            {/* ... */}
            <Card className="lg:col-span-2 bg-card">
              <CardHeader>
                <CardTitle>Revenue & Customer Growth</CardTitle>
                <CardDescription>Monthly revenue and customer count trends</CardDescription>
              </CardHeader>
              <CardContent>
                <RevenueChart data={stripeData?.section3_and_6_growth?.revenueCustomerChart} />
              </CardContent>
            </Card>

            <Card className="bg-card">
              <CardHeader>
                <CardTitle>Customer Acquisition</CardTitle>
                <CardDescription>New vs churned customers by month</CardDescription>
              </CardHeader>
              <CardContent>
                <CustomerAcquisitionChart data={stripeData?.section3_and_6_growth?.customerAcquisitionChart} />
              </CardContent>
            </Card>

            <Card className="bg-card">
              <CardHeader>
                <CardTitle>Plan Distribution</CardTitle>
                <CardDescription>Breakdown of currently active customers</CardDescription>
              </CardHeader>
              <CardContent>
                <PlanSplitChart distribution={planDistributionData} />
              </CardContent>
            </Card>
          </div>

          {/* Trial Funnel */}
          <Card className="bg-card">
            <CardHeader>
              <CardTitle>Trial Funnel</CardTitle>
              <CardDescription>Trial conversion metrics for selected period</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <TrialFunnelChart
                    dataValues={[
                      stripeData.section5_trial_funnel?.trialsStarted?.value ?? 0,
                      stripeData.section5_trial_funnel?.activeTrials?.value ?? 0,
                      stripeData.section5_trial_funnel?.convertedToPaid?.value ?? 0,
                      stripeData.section5_trial_funnel?.canceledTrials?.value ?? 0,
                    ]}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
                    <div>
                      <p className="text-sm font-medium">Trials Started</p>
                      <p className="text-2xl font-bold">{stripeData.section5_trial_funnel?.trialsStarted?.value ?? 0}</p>
                    </div><Zap className="h-8 w-8 text-blue-500" />
                  </div>
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
                    <div>
                      <p className="text-sm font-medium">Conversion Rate</p>
                      <p className="text-2xl font-bold">
                        {/* ✅ CORRECT: Multiply by 100 for percentage */}
                        {((stripeData.section5_trial_funnel?.conversionRate?.value ?? 0) * 100).toFixed(1)}%
                      </p>
                    </div><UserCheck className="h-8 w-8 text-green-500" />
                  </div>
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
                    <div>
                      <p className="text-sm font-medium">Converted to Paid</p>
                      <p className="text-2xl font-bold">{stripeData.section5_trial_funnel?.convertedToPaid?.value ?? 0}</p>
                    </div><CheckCircle className="h-8 w-8 text-green-600" />
                  </div>
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
                    <div>
                      <p className="text-sm font-medium">Canceled Trials</p>
                      {/* ✅ CORRECT: Fixed typo from 'cancelled' to 'canceled' */}
                      <p className="text-2xl font-bold">{stripeData.section5_trial_funnel?.canceledTrials?.value ?? 0}</p>
                    </div><XCircle className="h-8 w-8 text-red-500" />
                  </div>
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-card col-span-full">
                    <div>
                      <p className="text-sm font-medium">Active Trials (Right Now)</p>
                      <p className="text-2xl font-bold">{stripeData.section5_trial_funnel?.activeTrials?.value ?? 0}</p>
                    </div><Clock className="h-8 w-8 text-yellow-500" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Coming Soon / Bonus Metrics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-card">
              <CardHeader>
                <CardTitle>Affiliate Performance (Coming Soon)</CardTitle>
                <CardDescription>Mock data is shown below</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Affiliate</TableHead><TableHead>Subs</TableHead><TableHead>MRR</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockData.affiliates.map((a, i) => (
                      <TableRow key={i}><TableCell>{a.name}</TableCell><TableCell>{a.subs}</TableCell><TableCell>{formatCurrency(a.mrr)}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="bg-card">
                <CardHeader><CardTitle>Cash Flow</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center text-sm"><span className="text-muted-foreground">Cash Collected (Period)</span><span className="font-bold text-lg">{formatCurrency(stripeData.section4_cash_flow?.revenueCollectedThisMonth?.value ?? 0)}</span></div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </Suspense>
  )
}

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
import debounce from "lodash.debounce"; // or your own debounce function

// Lazy load named exports from multi-export files
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

// Lazy load default-exported components directly
import { DatePickerWithRange } from "@/components/date-range-picker"
import { RevenueChart } from "@/components/revenue-chart"
import { CustomerAcquisitionChart } from "@/components/customer-acquisition-chart"
import { PlanSplitChart } from "@/components/plan-split-chart"
import { TrialFunnelChart } from "@/components/trial-funnel-chart"
import { ThemeToggle } from "@/components/theme-toggle"
import LoadingSpinner from "@/components/loading-spinner"

// Mock data
const mockData = {
  kpis: {
    mrr: { value: 45280, delta: 12.5, trend: "up" },
    arr: { value: 543360, delta: 12.5, trend: "up" },
    avgLtv: { value: 2840, delta: -2.1, trend: "down" },
    churn: { value: 3.2, delta: 0.8, trend: "down" },
  },
  affiliates: [
    { name: "Sarah Chen", email: "sarah@example.com", subs: 24, mrr: 2880, commission: 20, payouts: 576, pending: 144 },
    {
      name: "Mike Johnson",
      email: "mike@example.com",
      subs: 18,
      mrr: 2160,
      commission: 15,
      payouts: 324,
      pending: 108,
    },
    { name: "Alex Rivera", email: "alex@example.com", subs: 31, mrr: 3720, commission: 25, payouts: 930, pending: 186 },
    { name: "Emma Davis", email: "emma@example.com", subs: 12, mrr: 1440, commission: 18, payouts: 259, pending: 72 },
  ],
  satisfaction: {
    csat: 4.2,
    nps: 42,
    submissions: 156,
    topComplaints: ["Slow loading times", "Limited integrations", "Pricing concerns"],
  },
  bonusMetrics: {
    totalCustomers: 1247,
    newCustomersMonth: 89,
    arpa: 36.32,
    planDistribution: {
      freelance: 687,
      studio: 423,
      agency: 137,
    },
  },
}

type KPIData = {
  mrr: { value: number; delta: number; trend: "up" | "down" },
  arr: { value: number; delta: number; trend: "up" | "down" },
  avgLtv: { value: number; delta: number; trend: "up" | "down" },
  churn: { value: number; delta: number; trend: "up" | "down" },
};

function getDateRangeFor(key) {
  const now = new Date();
  let start = new Date();
  switch (key) {
    case "last7days":
      start.setDate(now.getDate() - 7);
      break;
    case "last30days":
      start.setDate(now.getDate() - 30);
      break;
    case "last3months":
      start.setMonth(now.getMonth() - 3);
      break;
    case "last6months":
      start.setMonth(now.getMonth() - 6);
      break;
    case "last12months":
      start.setFullYear(now.getFullYear() - 1);
      break;
    default:
      start = null;
  }
  return {
    start: start ? start.toISOString().split("T")[0] : undefined,
    end: now.toISOString().split("T")[0],
  };
}

export default function Dashboard() {
  const [planFilter, setPlanFilter] = useState("all")

  const [dateRange, setDateRange] = useState("last3months");
  const [stripeData, setStripeData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Inside component

  // 🔁 Non-debounced fetch for first load or manual use
  const fetchStripeData = async ({ start, end, plan }) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/stripe?start=${start}&end=${end}&plan=${plan}`)
      const json = await res.json()
      setStripeData(json.metrics)
    } catch (err) {
      console.error("Error fetching Stripe data", err)
    } finally {
      setLoading(false)
    }
  }

  // 🕒 Debounced version to be reused in input filters
  const debouncedFetchRef = useRef()
  useEffect(() => {
    debouncedFetchRef.current = debounce(fetchStripeData, 500)
    return () => debouncedFetchRef.current.cancel()
  }, [])

  // ✅ Call normal fetch on first load
  useEffect(() => {
    const today = new Date()
    const last30 = new Date(today)
    last30.setDate(today.getDate() - 30)
    const start = last30.toISOString().split("T")[0]
    const end = today.toISOString().split("T")[0]

    setDateRange({ start, end })
    fetchStripeData({ start, end, plan: planFilter })
  }, [])

  // 👇 use in date picker change handler
  const handleDateChange = useCallback(
    ({ start, end }) => {
      setDateRange({ start, end })
      debouncedFetchRef.current({ start, end, plan: planFilter })
    },
    [planFilter]
  )

  const handlePlanChange = useCallback(
    (newPlan) => {
      setPlanFilter(newPlan)
      debouncedFetchRef.current({ start: dateRange.start, end: dateRange.end, plan: newPlan })
    },
    [dateRange]
  )

  function getDateRangeFor(key) {
    const now = new Date();
    let start = new Date();
    switch (key) {
      case "last7days":
        start.setDate(now.getDate() - 7);
        break;
      case "last30days":
        start.setDate(now.getDate() - 30);
        break;
      case "last3months":
        start.setMonth(now.getMonth() - 3);
        break;
      case "last6months":
        start.setMonth(now.getMonth() - 6);
        break;
      case "last12months":
        start.setFullYear(now.getFullYear() - 1);
        break;
      default:
        start = null;
    }
    return {
      start: start ? start.toISOString().split("T")[0] : undefined,
      end: now.toISOString().split("T")[0],
    };
  }

  const formatCurrency = (value) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  const formatDelta = (delta, trend) => {
    const Icon = trend === "up" ? TrendingUp : TrendingDown;
    const color = trend === "up" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";

    return (
      <div className={`flex items-center gap-1 text-sm ${color}`}>
        <Icon className="h-3 w-3" />
        {Math.abs(delta)}%
      </div>
    );
  };

  if (loading) return <div><LoadingSpinner /></div>;
  if (!stripeData) return <div>No data available</div>;

  const kpiData = {
    mrr: {
      value: stripeData.mrr,
      delta: stripeData.deltas?.mrr || 0,
      trend: stripeData.deltas?.mrr >= 0 ? "up" : "down",
    },
    arr: {
      value: stripeData.arr,
      delta: stripeData.deltas?.arr || 0,
      trend: stripeData.deltas?.arr >= 0 ? "up" : "down",
    },
    avgLtv: {
      value: stripeData.ltv,
      delta: stripeData.deltas?.avgLtv || 0,
      trend: stripeData.deltas?.avgLtv >= 0 ? "up" : "down",
    },
    churn: {
      value: stripeData.churnRate,
      delta: stripeData.deltas?.churn || 0,
      trend: stripeData.deltas?.churn >= 0 ? "up" : "down",
    },
  };

  return (
    <Suspense fallback={<LoadingSpinner />}>

      <div className="min-h-screen bg-background">
        <div className="container mx-auto p-6 space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-y-4 md:gap-y-0">
            {/* Title + Subtitle */}
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Timeliner Dashboard
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base">
                Track your business performance at a glance
              </p>
            </div>

            {/* Filters & Toggles */}
            <div className="flex flex-wrap md:flex-nowrap items-center gap-4">
              <ThemeToggle />
              <DatePickerWithRange onChange={handleDateChange} />
              {/* <Select value={planFilter} onValueChange={handlePlanChange}>
                <SelectTrigger className="w-[160px] sm:w-[180px]">
                  <SelectValue placeholder="Plan Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Plans</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select> */}
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
                    {key === "churn" ? `${val.value}%` : formatCurrency(val.value)}
                  </div>
                  <div className="flex items-center justify-between">
                    {formatDelta(val.delta, val.trend)}
                    <p className="text-xs text-muted-foreground">vs last period</p>
                  </div>
                </CardContent>
              </Card>
            ))}

          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* <Card className="lg:col-span-2 bg-card">
              <CardHeader>
                <CardTitle>Revenue & Customer Growth</CardTitle>
                <CardDescription>Monthly revenue and customer count trends</CardDescription>
              </CardHeader>
              <CardContent>
                <RevenueChart data={stripeData?.revenueCustomerChart} />
              </CardContent>
            </Card> */}

            {/* <Card className="bg-card">
              <CardHeader>
                <CardTitle>Customer Acquisition</CardTitle>
                <CardDescription>New vs churned customers by month</CardDescription>
              </CardHeader>
              <CardContent>
                <CustomerAcquisitionChart data={stripeData?.customerAcquisitionChart} />
              </CardContent>
            </Card> */}

            <Card className="bg-card">
              <CardHeader>
                <CardTitle>Plan Distribution</CardTitle>
                <CardDescription>Breakdown by plan tier</CardDescription>
              </CardHeader>
              <CardContent>
                <PlanSplitChart distribution={stripeData?.distribution} />
              </CardContent>
            </Card>
          </div>

          {/* Trial Funnel */}
          <Card className="bg-card">
            <CardHeader>
              <CardTitle>Trial Funnel</CardTitle>
              <CardDescription>Trial conversion metrics and costs</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <TrialFunnelChart
                    dataValues={[
                      stripeData.trialFunnel?.trialsStarted ?? 0,
                      stripeData.trialFunnel?.activeTrials ?? 0,
                      stripeData.trialFunnel?.convertedToPaid ?? 0,
                      stripeData.trialFunnel?.cancelledTrials ?? 0,
                    ]}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Trials Started */}
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
                    <div>
                      <p className="text-sm font-medium">Trials Started</p>
                      <p className="text-2xl font-bold">{stripeData.trialFunnel?.trialsStarted ?? 0}</p>
                    </div>
                    <Zap className="h-8 w-8 text-blue-500" />
                  </div>

                  {/* Conversion Rate */}
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
                    <div>
                      <p className="text-sm font-medium">Conversion Rate</p>
                      <p className="text-2xl font-bold">
                        {(stripeData.trialFunnel?.conversionRate ?? 0)}%
                        {/* {(stripeData.trialFunnel?.conversionRate ?? 0).toFixed(1)}% */}
                      </p>
                    </div>
                    <UserCheck className="h-8 w-8 text-green-500" />
                  </div>

                  {/* CAC / Cost per Trial */}
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
                    <div>
                      <p className="text-sm font-medium">CAC / Cost per Trial</p>
                      <p className="text-2xl font-bold">${stripeData.trialFunnel?.cpt ?? 0}</p>
                      <Badge variant="secondary" className="mt-1">
                        No ad campaigns yet
                      </Badge>
                    </div>
                    <DollarSign className="h-8 w-8 text-muted-foreground" />
                  </div>

                  {/* Converted to Paid */}
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
                    <div>
                      <p className="text-sm font-medium">Converted to Paid</p>
                      <p className="text-2xl font-bold">{stripeData.trialFunnel?.convertedToPaid ?? 0}</p>
                    </div>
                    <CheckCircle className="h-8 w-8 text-green-600" />
                  </div>

                  {/* Active Trials */}
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
                    <div>
                      <p className="text-sm font-medium">Active Trials</p>
                      <p className="text-2xl font-bold">{stripeData.trialFunnel?.activeTrials ?? 0}</p>
                    </div>
                    <Clock className="h-8 w-8 text-yellow-500" />
                  </div>

                  {/* Canceled Trials */}
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
                    <div>
                      <p className="text-sm font-medium">Canceled Trials</p>
                      <p className="text-2xl font-bold">{stripeData.trialFunnel?.cancelledTrials ?? 0}</p>
                    </div>
                    <XCircle className="h-8 w-8 text-red-500" />
                  </div>
                </div>

              </div>
            </CardContent>
          </Card>

          {/* Affiliate Performance */}
          <Card className="bg-card">
            <CardHeader>
              <CardTitle>Affiliate Performance</CardTitle>
              <CardDescription>Top performing affiliates and their metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Affiliate</TableHead>
                    <TableHead>Subs Referred</TableHead>
                    <TableHead>MRR Generated</TableHead>
                    <TableHead>Commission %</TableHead>
                    <TableHead>Payouts</TableHead>
                    <TableHead>Pending</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockData.affiliates.map((affiliate, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{affiliate.name}</p>
                          <p className="text-sm text-muted-foreground">{affiliate.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>{affiliate.subs}</TableCell>
                      <TableCell>{formatCurrency(affiliate.mrr)}</TableCell>
                      <TableCell>{affiliate.commission}%</TableCell>
                      <TableCell>{formatCurrency(affiliate.payouts)}</TableCell>
                      <TableCell>{formatCurrency(affiliate.pending)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* User Satisfaction & Bonus Metrics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-card">
              <CardHeader>
                <CardTitle>User Satisfaction</CardTitle>
                <CardDescription>Customer feedback and satisfaction scores</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold">{mockData.satisfaction.csat}</p>
                    <p className="text-sm text-muted-foreground">CSAT (1-5)</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{mockData.satisfaction.nps}</p>
                    <p className="text-sm text-muted-foreground">NPS Score</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{mockData.satisfaction.submissions}</p>
                    <p className="text-sm text-muted-foreground">Submissions</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Top Complaints:</p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {mockData.satisfaction.topComplaints.map((complaint, index) => (
                      <li key={index}>• {complaint}</li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <Card className="bg-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Total Customers</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{stripeData?.totalPayingCustomers?.toLocaleString() || "No Data"}</p>
                  </CardContent>
                </Card>
                <Card className="bg-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">New This Month</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{stripeData?.meta?.newCustomers || "No Data"}</p>
                  </CardContent>
                </Card>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Card className="bg-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">ARPA</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{formatCurrency(stripeData?.arpa) || "No Data"}</p>
                  </CardContent>
                </Card>
                <Card className="bg-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Plan Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {stripeData?.distribution.map((data) => (
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span>{data.plan}:</span>
                          <span>{data?.users}</span>
                        </div>
                        {/* <div className="flex justify-between">
                        <span>Agency:</span>
                        <span>{stripeData?.planCounts.Agency}</span>
                      </div> */}
                      </div>

                    ))}                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Suspense>

  )
}

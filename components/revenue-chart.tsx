"use client"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js"
import { Line } from "react-chartjs-2"

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

export function RevenueChart({ data }: { data: { month: string; revenue: number; customers: number }[] }) {
  const labels = data.map((item) => item.month)
  const revenueData = data.map((item) => item.revenue)
  const customerData = data.map((item) => item.customers)

  const chartData = {
    labels,
    datasets: [
      {
        label: "Revenue ($)",
        data: revenueData,
        borderColor: "rgb(59, 130, 246)",
        backgroundColor: "rgba(59, 130, 246, 0.1)",
        yAxisID: "y",
        tension: 0.4,
        borderWidth: 3,
        pointRadius: 6,
        pointHoverRadius: 8,
      },
      {
        label: "Customers",
        data: customerData,
        borderColor: "rgb(34, 197, 94)",
        backgroundColor: "rgba(34, 197, 94, 0.1)",
        yAxisID: "y1",
        tension: 0.4,
        borderWidth: 3,
        pointRadius: 6,
        pointHoverRadius: 8,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top" as const,
        labels: {
          usePointStyle: true,
          padding: 20,
        },
      },
      tooltip: {
        mode: "index" as const,
        intersect: false,
        callbacks: {
          label: (context: any) => {
            let label = context.dataset.label || ""
            if (label) label += ": "
            if (context.datasetIndex === 0) {
              label += "$" + context.parsed.y.toLocaleString()
            } else {
              label += context.parsed.y.toLocaleString()
            }
            return label
          },
        },
      },
    },
    interaction: {
      mode: "nearest" as const,
      axis: "x" as const,
      intersect: false,
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: "Month",
        },
        grid: {
          color: "rgba(0, 0, 0, 0.1)",
        },
      },
      y: {
        type: "linear" as const,
        display: true,
        position: "left" as const,
        title: {
          display: true,
          text: "Revenue ($)",
        },
        ticks: {
          callback: (value: any) => "$" + (value / 1000).toFixed(0) + "k",
        },
        grid: {
          color: "rgba(0, 0, 0, 0.1)",
        },
      },
      y1: {
        type: "linear" as const,
        display: true,
        position: "right" as const,
        title: {
          display: true,
          text: "Customers",
        },
        grid: {
          drawOnChartArea: false,
        },
      },
    },
  }

  return (
    <div className="w-full h-[400px]">
      <Line data={chartData} options={options} />
    </div>
  )
}

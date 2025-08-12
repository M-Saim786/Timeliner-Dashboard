"use client"

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export function CustomerAcquisitionChart({ data }: { data: { month: string, newCustomers: number, churnedCustomers: number }[] }) {
  const labels = data.map((item) => item.month);
  const newCustomers = data.map((item) => item.new);
  const churnedCustomers = data.map((item) => item.churned);

  const chartData = {
    labels,
    datasets: [
      {
        label: "New Customers",
        data: newCustomers,
        backgroundColor: "rgba(34, 197, 94, 0.8)",
        borderColor: "rgb(34, 197, 94)",
        borderWidth: 2,
        borderRadius: 6,
        borderSkipped: false,
      },
      {
        label: "Churned Customers",
        data: churnedCustomers,
        backgroundColor: "rgba(239, 68, 68, 0.8)",
        borderColor: "rgb(239, 68, 68)",
        borderWidth: 2,
        borderRadius: 6,
        borderSkipped: false,
      },
    ],
  };

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
      },
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
        display: true,
        title: {
          display: true,
          text: "Number of Customers",
        },
        beginAtZero: true,
        grid: {
          color: "rgba(0, 0, 0, 0.1)",
        },
      },
    },
  };

  return (
    <div className="w-full h-[350px]">
      <Bar data={chartData} options={options} />
    </div>
  );
}

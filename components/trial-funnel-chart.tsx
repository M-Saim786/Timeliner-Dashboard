'use client'

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

export function TrialFunnelChart({ dataValues = [0, 0, 0, 0] }: { dataValues: number[] }) {
  const data = {
    labels: ['Trials Started', 'Active Trials', 'Converted to Paid', 'Cancelled Trials'],
    datasets: [
      {
        label: 'Users',
        data: dataValues,
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',   // Trials Started (Blue)
          'rgba(139, 92, 246, 0.8)',   // Active Trials (Purple)
          'rgba(34, 197, 94, 0.8)',    // Converted to Paid (Green)
          'rgba(239, 68, 68, 0.8)',    // Cancelled Trials (Red)
        ],
        borderColor: [
          'rgb(59, 130, 246)',
          'rgb(139, 92, 246)',
          'rgb(34, 197, 94)',
          'rgb(239, 68, 68)',
        ],
        borderWidth: 2,
        borderRadius: 6,
        borderSkipped: false,
      },
    ],
  }

  const options = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: any) => `${context.label}: ${context.parsed.x} users`,
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Number of Users',
        },
        grid: { color: 'rgba(0, 0, 0, 0.1)' },
      },
      y: {
        grid: { color: 'rgba(0, 0, 0, 0.1)' },
      },
    },
  }

  return (
    <div className="w-full h-[300px]">
      <Bar data={data} options={options} />
    </div>
  )
}

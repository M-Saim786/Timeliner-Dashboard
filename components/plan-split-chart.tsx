'use client'

import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { Doughnut } from 'react-chartjs-2'
import { useTheme } from "next-themes";

ChartJS.register(ArcElement, Tooltip, Legend)

// ✅ CORRECTED TYPE: Matches the data structure being passed from the parent.
type DistributionItem = {
  name: string;  // Changed from 'plan' to 'name'
  value: number; // Changed from 'users' to 'value'
}

// ✅ ADDED FALLBACK: Default to an empty array if the prop is undefined.
export function PlanSplitChart({ distribution = [] }: { distribution: DistributionItem[] }) {


  const { theme } = useTheme();

  const labelColor = theme === "dark" ? "#fff" : "#000";


  // ✅ ADDED CHECK: Handle the case where there is no data to display.
  if (!distribution || distribution.length === 0) {
    return (
      <div className="flex items-center justify-center w-full h-[350px] text-muted-foreground">
        No plan distribution data available.
      </div>
    );
  }

  // ✅ CORRECTED LOGIC: Use 'name' and 'value' from the corrected type.
  const labels = distribution.map((d) => d.name);
  const dataValues = distribution.map((d) => d.value);

  // (The rest of the component remains largely the same)

  const colorMap: Record<string, string> = {
    freelancer: 'rgba(59, 130, 246, 0.8)', // blue
    studio: 'rgba(139, 92, 246, 0.8)',     // purple
    agency: 'rgba(245, 158, 11, 0.8)',     // orange
  }

  const backgroundColor = labels.map((label) => {
    const lower = label.toLowerCase()
    if (lower.includes('freelance')) return colorMap.freelancer
    if (lower.includes('studio')) return colorMap.studio
    if (lower.includes('agency')) return colorMap.agency
    return 'rgba(128, 128, 128, 0.8)' // gray fallback
  })

  const borderColor = backgroundColor.map((bg) =>
    bg.replace('0.8', '1')
  )

  const data = {
    labels,
    datasets: [
      {
        label: 'Users',
        data: dataValues,
        backgroundColor,
        borderColor,
        borderWidth: 2,
        hoverOffset: 10,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          usePointStyle: true,
          padding: 20,
          // color: labelColor,
          generateLabels: (chart: any) => {
            const data = chart.data
            if (data.labels.length && data.datasets.length) {
              return data.labels.map((label: string, i: number) => {
                const value = data.datasets[0].data[i]
                const total = data.datasets[0].data.reduce((a: number, b: number) => a + b, 0)
                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0
                return {
                  text: `${label}: ${value} (${percentage}%)`,
                  fillStyle: data.datasets[0].backgroundColor[i],
                  strokeStyle: data.datasets[0].borderColor[i],
                  lineWidth: data.datasets[0].borderWidth,
                  hidden: false,
                  index: i,
                  fontColor: labelColor,
                }
              })
            }
            return []
          },
        },
      },
      tooltip: {
        bodyColor: '#fff', // ✅ makes tooltip text white in dark mode
        callbacks: {
          label: (context: any) => {
            const label = context.label || ''
            const value = context.parsed
            const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0)
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0
            return `${label}: ${value} users (${percentage}%)`
          },
        },
      },
    },
    cutout: '50%',
  }


  return (
    <div className="w-full h-[350px]">
      <Doughnut data={data} options={options} />
    </div>
  )
}
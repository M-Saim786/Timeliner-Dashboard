'use client'

import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { Doughnut } from 'react-chartjs-2'

ChartJS.register(ArcElement, Tooltip, Legend)

type DistributionItem = {
  plan: string
  users: number
  percent: string
}

export function PlanSplitChart({ distribution }: { distribution: DistributionItem[] }) {
  // Extract labels and data dynamically from distribution array
  const labels = distribution.map((d) => d.plan)
  const dataValues = distribution.map((d) => d.users)

  // Pick colors for each plan or fallback to some default colors
  // (You can customize this color mapping based on your plan names)
  const colorMap: Record<string, string> = {
    freelancer: 'rgba(59, 130, 246, 0.8)', // blue
    studio: 'rgba(139, 92, 246, 0.8)',     // purple
    agency: 'rgba(245, 158, 11, 0.8)',     // orange
  }

  // Generate background colors based on plan name keyword match, fallback to gray
  const backgroundColor = labels.map((label) => {
    const lower = label.toLowerCase()
    if (lower.includes('freelancer')) return colorMap.freelancer
    if (lower.includes('studio')) return colorMap.studio
    if (lower.includes('agency')) return colorMap.agency
    return 'rgba(128, 128, 128, 0.8)' // gray fallback
  })

  const borderColor = backgroundColor.map((bg) =>
    bg.replace('0.8', '1') // make border fully opaque
  )

  const data = {
    labels,
    datasets: [
      {
        label: 'Users',
        data: dataValues,
        backgroundColor,
        borderColor,
        borderWidth: 3,
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
          generateLabels: (chart: any) => {
            const data = chart.data
            if (data.labels.length && data.datasets.length) {
              return data.labels.map((label: string, i: number) => {
                const value = data.datasets[0].data[i]
                const total = data.datasets[0].data.reduce((a: number, b: number) => a + b, 0)
                const percentage = ((value / total) * 100).toFixed(1)
                return {
                  text: `${label}: ${value} (${percentage}%)`,
                  fillStyle: data.datasets[0].backgroundColor[i],
                  strokeStyle: data.datasets[0].borderColor[i],
                  lineWidth: data.datasets[0].borderWidth,
                  hidden: false,
                  index: i,
                }
              })
            }
            return []
          },
        },
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const label = context.label || ''
            const value = context.parsed
            const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0)
            const percentage = ((value / total) * 100).toFixed(1)
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

"use client"

import type * as React from "react"
import { cn } from "@/lib/utils"

interface ChartContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  config?: Record<string, any>
}

export function ChartContainer({ className, children, config, ...props }: ChartContainerProps) {
  return (
    <div className={cn("w-full", className)} {...props}>
      {children}
    </div>
  )
}

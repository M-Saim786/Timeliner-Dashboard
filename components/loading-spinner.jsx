// components/LoadingSpinner.tsx
"use client"

import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"

export default function LoadingSpinner() {
  const { theme } = useTheme()

  return (
    <div className="w-full h-[60vh] flex flex-col items-center justify-center space-y-4">
      <div
        className={cn(
          "animate-spin rounded-full h-12 w-12 border-4",
          theme === "dark"
            ? "border-gray-700 border-t-white"
            : "border-gray-300 border-t-black"
        )}
      />
      <span className="text-sm text-muted-foreground">Loading dashboard...</span>
    </div>
  )
}

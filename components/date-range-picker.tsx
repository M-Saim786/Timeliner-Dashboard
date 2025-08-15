"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { addDays, format, parseISO } from "date-fns"
import type { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type DatePickerWithRangeProps = React.HTMLAttributes<HTMLDivElement> & {
  value?: { start: string; end: string } | null
  onChange?: (range: { start: string; end: string } | null) => void
}

export function DatePickerWithRange({
  value,
  className,
  onChange,
}: DatePickerWithRangeProps) {
  // ✅ Controlled date range from parent
  const controlledDate: DateRange | undefined = value
    ? {
        from: parseISO(value.start),
        to: parseISO(value.end),
      }
    : undefined

  // Internal state for temporary date selection (not yet applied)
  const [tempDateRange, setTempDateRange] = React.useState<DateRange | undefined>(controlledDate)
  
  // Track preset selection separately from manual selection
  const [preset, setPreset] = React.useState<string | null>(null)
  
  // Track if popover is open to manage state
  const [isOpen, setIsOpen] = React.useState(false)

  const presets = [
    { value: "today", label: "Today", days: 0 },
    { value: "yesterday", label: "Yesterday", days: 1 },
    { value: "last7days", label: "Last 7 days", days: 7 },
    { value: "last30days", label: "Last 30 days", days: 30 },
    { value: "last3months", label: "Last 3 months", days: 90 },
    { value: "last6months", label: "Last 6 months", days: 180 },
    { value: "thisyear", label: "This year", days: 365 },
  ]

  // Update internal state when external value changes
  React.useEffect(() => {
    if (value) {
      const newRange = {
        from: parseISO(value.start),
        to: parseISO(value.end),
      }
      setTempDateRange(newRange)
      
      // Check if the current value matches any preset
      const today = new Date()
      const startDate = parseISO(value.start)
      const endDate = parseISO(value.end)
      
      const matchingPreset = presets.find((p) => {
        const expectedStart = addDays(today, -p.days)
        return (
          startDate.toDateString() === expectedStart.toDateString() &&
          endDate.toDateString() === today.toDateString()
        )
      })
      
      setPreset(matchingPreset?.value || null)
    } else {
      setTempDateRange(undefined)
      setPreset(null)
    }
  }, [value])

  const handlePresetChange = (presetValue: string) => {
    setPreset(presetValue)
    const selectedPreset = presets.find((p) => p.value === presetValue)
    if (selectedPreset) {
      const newRange = {
        from: addDays(new Date(), -selectedPreset.days),
        to: new Date(),
      }
      setTempDateRange(newRange)
      // Apply preset immediately since it's a complete range
      onChange?.({
        start: newRange.from.toISOString().split("T")[0],
        end: newRange.to.toISOString().split("T")[0],
      })
    }
  }

  const handleManualChange = (range: DateRange | undefined) => {
    // Clear preset when manually selecting dates
    setPreset(null)
    // Update internal state without triggering onChange
    setTempDateRange(range)
  }

  const handleApply = () => {
    if (tempDateRange?.from && tempDateRange?.to) {
      onChange?.({
        start: tempDateRange.from.toISOString().split("T")[0],
        end: tempDateRange.to.toISOString().split("T")[0],
      })
      setIsOpen(false) // Close popover after applying
    }
  }

  const handleClearSelection = () => {
    setPreset(null)
    setTempDateRange(undefined)
    onChange?.(null)
    setIsOpen(false) // Close popover after clearing
  }

  const handleCancel = () => {
    // Reset to original value and close popover
    setTempDateRange(controlledDate)
    setIsOpen(false)
  }

  const isApplyDisabled = !tempDateRange?.from || !tempDateRange?.to
  const hasChanges = JSON.stringify(tempDateRange) !== JSON.stringify(controlledDate)

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-[300px] justify-start text-left font-normal bg-card",
              !controlledDate && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {controlledDate?.from ? (
              controlledDate.to ? (
                <>
                  {format(controlledDate.from, "LLL dd, y")} -{" "}
                  {format(controlledDate.to, "LLL dd, y")}
                </>
              ) : (
                format(controlledDate.from, "LLL dd, y")
              )
            ) : (
              <span>Pick a date</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 bg-popover" align="start">
          <div className="p-3 border-b space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Quick Presets</span>
              {controlledDate && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearSelection}
                  className="h-6 px-2 text-xs"
                >
                  Clear
                </Button>
              )}
            </div>
            <Select value={preset || ""} onValueChange={handlePresetChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select preset" />
              </SelectTrigger>
              <SelectContent>
                {presets.map((preset) => (
                  <SelectItem key={preset.value} value={preset.value}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={tempDateRange?.from || controlledDate?.from || new Date()}
            selected={tempDateRange}
            onSelect={handleManualChange}
            numberOfMonths={2}
            disabled={(date) => date > new Date()}
          />
          
          {/* Action buttons */}
          <div className="p-3 border-t flex items-center justify-between gap-2">
            <div className="text-sm text-muted-foreground">
              {tempDateRange?.from && tempDateRange?.to ? (
                <>
                  {format(tempDateRange.from, "MMM dd")} - {format(tempDateRange.to, "MMM dd, yyyy")}
                </>
              ) : tempDateRange?.from ? (
                `Start: ${format(tempDateRange.from, "MMM dd, yyyy")}`
              ) : (
                "Select start and end dates"
              )}
            </div>
            <div className="flex gap-2">
              {hasChanges && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                >
                  Cancel
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleApply}
                disabled={isApplyDisabled}
              >
                Apply
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}


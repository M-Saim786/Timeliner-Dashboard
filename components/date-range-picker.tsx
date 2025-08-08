"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { addDays, format } from "date-fns"
import type { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function DatePickerWithRange({
  className,
  onChange,
}: React.HTMLAttributes<HTMLDivElement> & {
  onChange?: (range: { start: string; end: string }) => void;
}) {
  const [date, setDate] = React.useState<DateRange | undefined>({
    from: addDays(new Date(), -30),
    to: new Date(),
  });
  const [preset, setPreset] = React.useState("last30days");

  const presets = [
    { value: "today", label: "Today", days: 0 },
    { value: "yesterday", label: "Yesterday", days: 1 },
    { value: "last7days", label: "Last 7 days", days: 7 },
    { value: "last30days", label: "Last 30 days", days: 30 },
    { value: "last3months", label: "Last 3 months", days: 90 },
    { value: "last6months", label: "Last 6 months", days: 180 },
    { value: "thisyear", label: "This year", days: 365 },
  ];

  const handlePresetChange = (value: string) => {
    setPreset(value);
    const selectedPreset = presets.find((p) => p.value === value);
    if (selectedPreset) {
      const newRange = {
        from: addDays(new Date(), -selectedPreset.days),
        to: new Date(),
      };
      setDate(newRange);
      onChange?.({
        start: newRange.from.toISOString().split("T")[0],
        end: newRange.to.toISOString().split("T")[0],
      });
    }
  };

  const handleManualChange = (range: DateRange | undefined) => {
    setDate(range);
    if (range?.from && range?.to) {
      onChange?.({
        start: range.from.toISOString().split("T")[0],
        end: range.to.toISOString().split("T")[0],
      });
    }
  };

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn("w-[300px] justify-start text-left font-normal bg-card", !date && "text-muted-foreground")}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "LLL dd, y")} - {format(date.to, "LLL dd, y")}
                </>
              ) : (
                format(date.from, "LLL dd, y")
              )
            ) : (
              <span>Pick a date</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 bg-popover" align="start">
          <div className="p-3 border-b">
            <Select value={preset} onValueChange={handlePresetChange}>
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
            defaultMonth={date?.from}
            selected={date}
            onSelect={handleManualChange}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

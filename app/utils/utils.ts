import { DateRange } from './types';

export function getMonthlyBins(start: number, end: number): { month: string; start: number; end: number }[] {
  const bins: { month: string; start: number; end: number }[] = [];
  const date = new Date(start * 1000);
  date.setDate(1); // Start at beginning of month

  while (date.getTime() / 1000 < end) {
    const startOfMonth = Math.floor(date.getTime() / 1000);
    date.setMonth(date.getMonth() + 1);
    const endOfMonth = Math.floor(date.getTime() / 1000 - 1);

    bins.push({
      month: new Date(startOfMonth * 1000).toLocaleString('default', { month: 'short' }),
      start: startOfMonth,
      end: endOfMonth,
    });
  }

  return bins;
}

export function getPeriodRange(start: string, end: string): DateRange {
  return {
    start: Math.floor(new Date(start).getTime() / 1000),
    end: Math.floor(new Date(end).getTime() / 1000),
  };
}

export function getDelta(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Number(((current - previous) / previous * 100).toFixed(1));
}

export function isInRange(timestamp: number | null, range: DateRange): boolean {
  if (!timestamp) return false;
  return timestamp >= (range.start ?? 0) && timestamp <= range.end;
}
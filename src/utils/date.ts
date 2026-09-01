/**
 * Formats a date string or Date object into a relative time string (e.g., "Just now", "2m ago", "1d ago").
 * Never returns absolute calendar dates, only relative counts.
 */
export function formatRelativeTime(dateInput: string | Date | undefined | null): string {
  if (!dateInput) return 'Just now';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 30) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${diffDays || 1}d ago`;
}

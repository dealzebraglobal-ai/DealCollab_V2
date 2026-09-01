/**
 * DealCollab — Canonical Date and Time Utilities
 * ===============================================
 * Handles exact timestamps and relative times with 3-day approval window awareness.
 *
 * Example exact format: "31 Aug 2026, 2:30 PM"
 * Example relative format: "1 hour ago", "2 days ago", "3 days ago"
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Formats date into exact readable string: "31 Aug 2026, 2:30 PM"
 */
export function formatExactDateTime(dateInput: string | Date | undefined | null): string {
  if (!dateInput) return 'Date unavailable';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return 'Invalid date';

  const day = date.getDate();
  const month = MONTHS[date.getMonth()];
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 -> 12

  return `${day} ${month} ${year}, ${hours}:${minutes} ${ampm}`;
}

/**
 * Formats a date string or Date object into human relative time.
 * E.g., "Just now", "45 minutes ago", "1 hour ago", "2 days ago", "3 days ago"
 */
export function formatRelativeTime(
  dateInput: string | Date | undefined | null,
  referenceNow?: Date
): string {
  if (!dateInput) return 'Just now';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return 'Just now';

  const now = referenceNow || new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return 'Just now';

  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 45) return 'Just now';
  if (diffMin === 1) return '1 minute ago';
  if (diffMin < 60) return `${diffMin} minutes ago`;
  if (diffHr === 1) return '1 hour ago';
  if (diffHr < 24) return `${diffHr} hours ago`;
  if (diffDays === 1) return '1 day ago';
  return `${diffDays} days ago`;
}

/**
 * Combined helper for Deal Dashboard / Deal Log cards.
 * Returns exact, relative, combined string, and 3-day window status.
 */
export function formatDealTimestamp(
  dateInput: string | Date | undefined | null,
  referenceNow?: Date
): {
  exact: string;
  relative: string;
  combined: string;
  isNearDeadline: boolean;
  isExpired: boolean;
  hoursRemaining: number;
} {
  if (!dateInput) {
    return {
      exact: 'Date unavailable',
      relative: 'Just now',
      combined: 'Just now',
      isNearDeadline: false,
      isExpired: false,
      hoursRemaining: 72,
    };
  }

  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) {
    return {
      exact: 'Invalid date',
      relative: 'Just now',
      combined: 'Just now',
      isNearDeadline: false,
      isExpired: false,
      hoursRemaining: 72,
    };
  }

  const exact = formatExactDateTime(date);
  const relative = formatRelativeTime(date, referenceNow);
  const now = referenceNow || new Date();

  // 3-day approval window = 72 hours
  const elapsedMs = now.getTime() - date.getTime();
  const totalWindowMs = 72 * 60 * 60 * 1000;
  const remainingMs = totalWindowMs - elapsedMs;
  const hoursRemaining = Math.max(0, Math.round(remainingMs / (60 * 60 * 1000)));

  const isExpired = remainingMs <= 0;
  const isNearDeadline = !isExpired && hoursRemaining <= 24; // Less than 24h remaining in 3-day window

  return {
    exact,
    relative,
    combined: `${exact} • ${relative}`,
    isNearDeadline,
    isExpired,
    hoursRemaining,
  };
}

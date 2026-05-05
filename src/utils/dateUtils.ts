/**
 * dateUtils.ts — Timezone-agnostic IST date helpers
 *
 * All functions use pure UTC arithmetic (getTime() + offsets) and never rely
 * on the host system's local timezone (getTimezoneOffset(), setHours, etc.).
 * This makes them safe on any server: Mac IST, Linux UTC, Vercel UTC, etc.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30 = 19 800 000 ms
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Returns a Date representing 00:00:00 IST of the current calendar day,
 * expressed as a UTC timestamp.
 *
 * Example (server can be in any timezone):
 *   now = 2026-04-07T07:31:00Z  →  1:01 PM IST
 *   istMs  = 2026-04-07T13:01:00Z (shifted to IST)
 *   floor  = 2026-04-07T00:00:00Z (IST midnight in "IST space")
 *   result = 2026-04-06T18:30:00Z (IST midnight expressed in UTC)
 */
export function getISTMidnightUTC(now: Date = new Date()): Date {
  const istMs = now.getTime() + IST_OFFSET_MS;
  const istMidnightMs = istMs - (istMs % DAY_MS);
  return new Date(istMidnightMs - IST_OFFSET_MS);
}

/**
 * Returns true if the given UTC instant falls within IST market hours
 * (Mon–Fri, 09:00 – 15:30 IST).
 */
export function isISTMarketOpen(now: Date = new Date()): boolean {
  const istMs = now.getTime() + IST_OFFSET_MS;
  // Day-of-week in IST (0 = Sun, 6 = Sat)
  const dayOfWeek = new Date(istMs).getUTCDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;

  // Minutes since IST midnight
  const minuteOfDay = Math.floor((istMs % DAY_MS) / 60_000);
  return minuteOfDay >= 9 * 60 && minuteOfDay <= 15 * 60 + 30;
}

/**
 * Returns true if today (IST) is a weekday (Mon–Fri).
 */
export function isISTWeekday(now: Date = new Date()): boolean {
  const istMs = now.getTime() + IST_OFFSET_MS;
  const dayOfWeek = new Date(istMs).getUTCDay();
  return dayOfWeek >= 1 && dayOfWeek <= 5;
}

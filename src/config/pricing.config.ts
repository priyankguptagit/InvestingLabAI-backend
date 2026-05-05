/**
 * ─────────────────────────────────────────────────────
 *  CENTRALIZED PRICING CONFIG  ·  Backend (Razorpay)
 * ─────────────────────────────────────────────────────
 *  Amounts are in PAISE (₹1 = 100 paise).
 *  The server reads from here — the client CANNOT
 *  manipulate the charge amount.
 *
 *  To update prices: change values here only.
 *  Keys: plan name → duration in months → paise.
 * ─────────────────────────────────────────────────────
 */

export type PlanName = 'Silver' | 'Gold' | 'Diamond';
export type Duration = 1 | 3 | 6;

export const PLAN_PRICES_PAISE: Record<PlanName, Record<Duration, number>> = {
  Silver:  { 1: 49900,   3: 129900,  6: 249900  },
  Gold:    { 1: 99900,   3: 269900,  6: 519900  },
  Diamond: { 1: 249900,  3: 649900,  6: 1249900 },
};

export type StudentPlan = 'Free' | 'Silver' | 'Gold' | 'Diamond';

const PLAN_MAP: Record<string, StudentPlan> = {
  free: 'Free',
  silver: 'Silver',
  gold: 'Gold',
  diamond: 'Diamond',
};

const PLAN_KEYS = ['plan', 'currentplan', 'subscriptionplan', 'planname'];

export const normalizeStudentPlan = (value: unknown): StudentPlan => {
  if (value === null || value === undefined) return 'Free';

  const normalized = String(value).trim().toLowerCase();
  if (!normalized || normalized === 'free') return 'Free';

  const mapped = PLAN_MAP[normalized];
  if (!mapped) {
    throw new Error(`Invalid plan value "${String(value)}". Allowed values: Free, Silver, Gold, Diamond.`);
  }

  return mapped;
};

export const extractStudentPlanFromCsvRow = (row: Record<string, any>): StudentPlan => {
  for (const [rawKey, rawValue] of Object.entries(row || {})) {
    const key = String(rawKey).replace(/[^a-zA-Z]/g, '').toLowerCase();
    if (PLAN_KEYS.includes(key)) {
      return normalizeStudentPlan(rawValue);
    }
  }

  return 'Free';
};

export const buildStudentPlanFields = (plan: StudentPlan) => {
  if (plan === 'Free') {
    return {
      currentPlan: 'Free' as StudentPlan,
      subscriptionStatus: undefined,
      subscriptionExpiry: undefined,
      isOnTrial: false,
    };
  }

  return {
    currentPlan: plan,
    subscriptionStatus: 'active' as const,
    subscriptionExpiry: undefined,
    isOnTrial: false,
  };
};

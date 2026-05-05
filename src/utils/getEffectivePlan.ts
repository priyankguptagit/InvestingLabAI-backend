import { IUser } from '../models/user';
import { PlanTier } from '../config/plans';

const VALID_PAID_PLANS: PlanTier[] = ['Silver', 'Gold', 'Diamond'];

export const getEffectivePlan = (
    user: IUser,
    organization?: any
): PlanTier => {
    const isApprovedOrgStudent =
        !!user.organization && user.organizationApprovalStatus === 'approved';
    const hasStandalonePaidAccess =
        !!user.subscriptionId || !!user.subscriptionExpiry;

    // 1. Organization-inherited plan
    if (
        isApprovedOrgStudent &&
        organization &&
        organization.subscriptionStatus === 'active' &&
        organization.subscriptionPlan
    ) {
        if (!organization.subscriptionExpiry || new Date(organization.subscriptionExpiry) > new Date()) {
            const limits = organization.planSeatLimits || {};
            const hasMixedSeatAllocation =
                (limits.Silver || 0) > 0 ||
                (limits.Gold || 0) > 0 ||
                (limits.Diamond || 0) > 0;

            // Mixed allocation mode: each student uses their own assigned currentPlan.
            if (hasMixedSeatAllocation) {
                if (VALID_PAID_PLANS.includes(user.currentPlan as PlanTier)) {
                    return user.currentPlan as PlanTier;
                }
                return 'Free';
            }

            // Legacy uniform mode: whole organization shares one plan.
            return organization.subscriptionPlan as PlanTier;
        }
    }

    // 2. Active trial — use trialEndDate, not subscriptionExpiry
    if (user.isOnTrial && user.trialEndDate) {
        if (new Date(user.trialEndDate) > new Date()) {
            // Trial is still active — validate the plan name is a recognized paid tier
            if (VALID_PAID_PLANS.includes(user.currentPlan as PlanTier)) {
                return user.currentPlan as PlanTier;
            }
        }
        // Trial date has passed — fall through to Free
        return 'Free';
    }

    // 3. Individually purchased (non-trial) paid plan
    if (VALID_PAID_PLANS.includes(user.currentPlan as PlanTier)) {
        if (isApprovedOrgStudent && !hasStandalonePaidAccess) {
            return 'Free';
        }

        // Plan name is valid — check it hasn't expired
        if (!user.subscriptionExpiry || new Date(user.subscriptionExpiry) > new Date()) {
            return user.currentPlan as PlanTier;
        }
        // Expired — fall through to Free
    }

    // 4. Default: Free
    return 'Free';
};

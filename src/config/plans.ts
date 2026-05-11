export type PlanTier = 'Free' | 'Silver' | 'Gold' | 'Diamond';

export interface PlanLimits {
    tier: PlanTier;
    /**
     * The virtual balance (in ₹) credited to a user when they activate this plan.
     * ─────────────────────────────────────────────────────────────────────────────
     * TO CHANGE A PLAN'S STARTING BALANCE: Edit `initialVirtualBalance` below.
     * This value is read at every plan-activation point in the codebase.
     */
    initialVirtualBalance: number;
    maxVirtualBalance: number;     // Upper cap — user cannot reset above this amount
    canPaperTrade: boolean;
    monthlyNewsAiLimits: number;
    monthlyPortfolioAiLimits: number;
    chatbotTokens: number;
    hasCertificate: boolean;
    hasAdvancedCertificate: boolean;
    mentorshipSessions: number;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
    Free: {
        tier: 'Free',
        initialVirtualBalance: 0,         // ₹0 — free users cannot paper trade
        maxVirtualBalance: 0,
        canPaperTrade: false,
        monthlyNewsAiLimits: 0,
        monthlyPortfolioAiLimits: 0,
        chatbotTokens: 0,
        hasCertificate: false,
        hasAdvancedCertificate: false,
        mentorshipSessions: 0,
    },
    Silver: {
        tier: 'Silver',
        initialVirtualBalance: 100000,    // ₹1,00,000 — 1 Lakh
        maxVirtualBalance: 100000,        // 1 Lac
        canPaperTrade: true,
        monthlyNewsAiLimits: 0,
        monthlyPortfolioAiLimits: 0,
        chatbotTokens: 0,
        hasCertificate: false,
        hasAdvancedCertificate: false,
        mentorshipSessions: 0,
    },
    Gold: {
        tier: 'Gold',
        initialVirtualBalance: 500000,    // ₹5,00,000 — 5 Lakh
        maxVirtualBalance: 500000,        // 5 Lac
        canPaperTrade: true,
        monthlyNewsAiLimits: 5,
        monthlyPortfolioAiLimits: 2,
        chatbotTokens: 10000,
        hasCertificate: true,
        hasAdvancedCertificate: false,
        mentorshipSessions: 0,
    },
    Diamond: {
        tier: 'Diamond',
        initialVirtualBalance: 1000000,   // ₹10,00,000 — 10 Lakh
        maxVirtualBalance: 1000000,       // 10 Lac (1M)
        canPaperTrade: true,
        monthlyNewsAiLimits: 10,
        monthlyPortfolioAiLimits: 4,
        chatbotTokens: 20000,
        hasCertificate: true,
        hasAdvancedCertificate: true,
        mentorshipSessions: 2,
    },
};

export const getPlanLimits = (tier: PlanTier | string | undefined | null): PlanLimits => {
    if (!tier) return PLAN_LIMITS['Free'];
    const normalizedTier = tier as PlanTier;
    return PLAN_LIMITS[normalizedTier] || PLAN_LIMITS['Free'];
};

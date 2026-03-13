import prisma from '../prisma.js';

export type SubscriptionTier = 'FREE_TRIAL' | 'BASIC' | 'PRO' | 'PREMIUM';

type PlanLimits = {
  maxTotalStudents: number | null;
  maxQuizzes: number | null;          // total quizzes (null = unlimited)
  autoGrading: boolean;
  reports: string;
  questionBank: boolean;
  leaderboard: boolean;
  antiCheat: string;
  whatsapp: string;
  assistants: number;
};

type PlanInfo = {
  tier: SubscriptionTier;
  nameAr: string;
  nameEn: string;
  priceMonthly: number;             // in EGP, 0 = free
  limits: PlanLimits;
};

export const PLANS: Record<SubscriptionTier, PlanInfo> = {
  FREE_TRIAL: {
    tier: 'FREE_TRIAL',
    nameAr: 'باقة التجربة',
    nameEn: 'Free',
    priceMonthly: 0,
    limits: {
      maxTotalStudents: 50,
      maxQuizzes: 2,
      autoGrading: true,
      reports: 'basic',
      questionBank: false,
      leaderboard: false,
      antiCheat: 'basic',
      whatsapp: 'none',
      assistants: 0,
    },
  },
  BASIC: {
    tier: 'BASIC',
    nameAr: 'باقة المبتدئ',
    nameEn: 'Starter',
    priceMonthly: 199,
    limits: {
      maxTotalStudents: 100,
      maxQuizzes: null,
      autoGrading: true,
      reports: 'excel',
      questionBank: false,
      leaderboard: true,
      antiCheat: 'medium',
      whatsapp: 'none',
      assistants: 0,
    },
  },
  PRO: {
    tier: 'PRO',
    nameAr: 'باقة المجموعات',
    nameEn: 'Pro',
    priceMonthly: 399,
    limits: {
      maxTotalStudents: 200,
      maxQuizzes: null,
      autoGrading: true,
      reports: 'full',
      questionBank: true,
      leaderboard: true,
      antiCheat: 'advanced',
      whatsapp: 'paid',
      assistants: 0,
    },
  },
  PREMIUM: {
    tier: 'PREMIUM',
    nameAr: 'باقة النخبة',
    nameEn: 'Elite',
    priceMonthly: 699,
    limits: {
      maxTotalStudents: 600,
      maxQuizzes: null,
      autoGrading: true,
      reports: 'comprehensive',
      questionBank: true,
      leaderboard: true,
      antiCheat: 'max',
      whatsapp: 'included',
      assistants: 2,
    },
  },
};

export const getPlanLimits = (tier: SubscriptionTier): PlanLimits => PLANS[tier].limits;
export const getPlanInfo = (tier: SubscriptionTier): PlanInfo => PLANS[tier];
export const getAllPlans = (): PlanInfo[] => Object.values(PLANS);

export const getActiveSubscriptionForTeacher = async (teacherId: string) => {
  const now = new Date();

  const subscription = await prisma.subscription.findFirst({
    where: {
      teacherId,
      status: 'active',
    },
    orderBy: { startedAt: 'desc' },
  });

  if (!subscription) return null;

  if (subscription.expiresAt && subscription.expiresAt < now) {
    // Mark as expired
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'expired' },
    });
    return null;
  }

  return subscription;
};

/**
 * Check if a teacher can add more students. Returns { allowed, current, max }.
 */
export const checkStudentLimit = async (teacherId: string, tier: SubscriptionTier) => {
  const limits = getPlanLimits(tier);
  if (limits.maxTotalStudents === null) return { allowed: true, current: 0, max: null };

  const current = await prisma.student.count({
    where: { class: { teacherId } },
  });

  return {
    allowed: current < limits.maxTotalStudents,
    current,
    max: limits.maxTotalStudents,
  };
};

/**
 * Check if a teacher can create more quizzes. Returns { allowed, current, max }.
 */
export const checkQuizLimit = async (teacherId: string, tier: SubscriptionTier) => {
  const limits = getPlanLimits(tier);
  if (limits.maxQuizzes === null) return { allowed: true, current: 0, max: null };

  const current = await prisma.quiz.count({
    where: { teacherId },
  });

  return {
    allowed: current < limits.maxQuizzes,
    current,
    max: limits.maxQuizzes,
  };
};

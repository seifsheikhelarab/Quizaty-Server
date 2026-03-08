import prisma from '../prisma.js';

export type SubscriptionTier = 'FREE_TRIAL' | 'BASIC' | 'PRO' | 'PREMIUM';

type PlanLimits = {
  maxClasses: number | null;
  maxStudentsPerClass: number | null;
  maxTotalStudents: number | null;
  maxQuizzesPerClassPerMonth: number | null;
};

const PLAN_LIMITS: Record<SubscriptionTier, PlanLimits> = {
  FREE_TRIAL: {
    maxClasses: 3,
    maxStudentsPerClass: 50,
    maxTotalStudents: 50,
    maxQuizzesPerClassPerMonth: 2,
  },
  BASIC: {
    maxClasses: 3,
    maxStudentsPerClass: 100,
    maxTotalStudents: null,
    maxQuizzesPerClassPerMonth: 5,
  },
  PRO: {
    maxClasses: 3,
    maxStudentsPerClass: 300,
    maxTotalStudents: null,
    maxQuizzesPerClassPerMonth: null,
  },
  PREMIUM: {
    maxClasses: null,
    maxStudentsPerClass: null,
    maxTotalStudents: null,
    maxQuizzesPerClassPerMonth: null,
  },
};

export const getPlanLimits = (tier: SubscriptionTier): PlanLimits => PLAN_LIMITS[tier];

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


export interface Reward {
  id: string;
  title: string;
  description: string;
  icon: string;
  requirement: { type: "streak" | "total_minutes"; value: number };
}

export const REWARDS: Reward[] = [
  {
    id: "first-timeout",
    title: "First Step",
    description: "Complete your first tech timeout",
    icon: "🌱",
    requirement: { type: "total_minutes", value: 1 },
  },
  {
    id: "hour-hero",
    title: "Hour Hero",
    description: "60 minutes of quality time together",
    icon: "⏰",
    requirement: { type: "total_minutes", value: 60 },
  },
  {
    id: "streak-3",
    title: "Three-Peat",
    description: "3-day timeout streak",
    icon: "🔥",
    requirement: { type: "streak", value: 3 },
  },
  {
    id: "streak-7",
    title: "Week Warrior",
    description: "7-day timeout streak",
    icon: "⚡",
    requirement: { type: "streak", value: 7 },
  },
  {
    id: "five-hours",
    title: "Time Rich",
    description: "5 hours of tech-free time",
    icon: "💎",
    requirement: { type: "total_minutes", value: 300 },
  },
  {
    id: "streak-14",
    title: "Fortnight Focus",
    description: "14-day timeout streak",
    icon: "🏆",
    requirement: { type: "streak", value: 14 },
  },
  {
    id: "streak-30",
    title: "Monthly Master",
    description: "30-day timeout streak",
    icon: "👑",
    requirement: { type: "streak", value: 30 },
  },
  {
    id: "ten-hours",
    title: "Connection Champion",
    description: "10 hours of tech-free time",
    icon: "🌟",
    requirement: { type: "total_minutes", value: 600 },
  },
  {
    id: "day-total",
    title: "Full Day",
    description: "24 hours of total tech-free time",
    icon: "🎯",
    requirement: { type: "total_minutes", value: 1440 },
  },
  {
    id: "streak-60",
    title: "Legendary",
    description: "60-day timeout streak",
    icon: "✨",
    requirement: { type: "streak", value: 60 },
  },
];

export function getUnlockedRewards(
  currentStreak: number,
  totalMinutes: number
): Reward[] {
  return REWARDS.filter((r) => {
    if (r.requirement.type === "streak") return currentStreak >= r.requirement.value;
    return totalMinutes >= r.requirement.value;
  });
}

export function getNextReward(
  currentStreak: number,
  totalMinutes: number
): Reward | null {
  const locked = REWARDS.filter((r) => {
    if (r.requirement.type === "streak") return currentStreak < r.requirement.value;
    return totalMinutes < r.requirement.value;
  });
  return locked[0] || null;
}

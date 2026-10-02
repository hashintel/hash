export const interviewBudgetLevels = [
  "off",
  "quick",
  "standard",
  "thorough",
  "deep",
] as const;
export type InterviewBudgetLevel = (typeof interviewBudgetLevels)[number];
export const interviewBudgetHeader = "x-petrinaut-interview-budget";
export const interviewBudgetLevelsConfig = {
  off: {
    name: "Off",
    guide: "Usual pacing",
    minutes: 0,
    text: null,
    voice: null,
    description: "Use Brunch’s usual pacing.",
  },
  quick: {
    name: "Quick",
    guide: "~5 min",
    minutes: 5,
    text: 3,
    voice: 2,
    description: "Just the essentials.",
  },
  standard: {
    name: "Standard",
    guide: "~10 min",
    minutes: 10,
    text: 6,
    voice: 4,
    description: "Focus on the main steps.",
  },
  thorough: {
    name: "Thorough",
    guide: "~20 min",
    minutes: 20,
    text: 10,
    voice: 7,
    description: "Explore details and exceptions.",
  },
  deep: {
    name: "Deep",
    guide: "No limit",
    minutes: 0,
    text: null,
    voice: null,
    description: "Keep exploring, with pauses between topics.",
  },
} as const;

export const isInterviewBudgetLevel = (
  value: unknown,
): value is InterviewBudgetLevel =>
  typeof value === "string" &&
  interviewBudgetLevels.some((level) => level === value);

export const getInterviewBudget = (
  level: InterviewBudgetLevel,
  mode: "text" | "voice",
  asked: number,
) => {
  if (level === "off") return undefined;
  const questionCap = interviewBudgetLevelsConfig[level][mode];
  return {
    level,
    questionCap,
    asked,
    remaining: questionCap === null ? null : Math.max(0, questionCap - asked),
  };
};

/** Completed canonical replies only, never Live captions or tool-only messages. */
export const countInterviewReplies = (
  messages: readonly {
    readonly role: string;
    readonly parts: readonly {
      readonly type: string;
      readonly text?: string;
      readonly state?: string;
    }[];
  }[],
): number =>
  messages.filter(
    (message) =>
      message.role === "assistant" &&
      message.parts.some(
        (part) =>
          part.type === "text" &&
          part.text?.trim() &&
          part.state !== "streaming",
      ),
  ).length;

export const interviewBudgetLabel = (
  level: InterviewBudgetLevel,
  mode: "text" | "voice",
  asked: number,
): string | null => {
  const budget = getInterviewBudget(level, mode, asked);
  if (!budget) return null;
  if (budget.remaining === null || budget.questionCap === null)
    return `Question ${asked} · no limit`;
  if (budget.remaining === 0) return "Ready to wrap up";
  const minutes = Math.round(
    (budget.remaining * interviewBudgetLevelsConfig[level].minutes) /
      budget.questionCap,
  );
  return budget.remaining === 1
    ? `1 question left · ~${minutes} min`
    : `~${minutes} min left`;
};

export const liveInterviewBudgetInstruction = (
  level: InterviewBudgetLevel,
): string => {
  if (level === "off") return "";
  const config = interviewBudgetLevelsConfig[level];
  return `Interview budget: ${config.name} (${config.guide}). Minutes are a guide, not a timer. Brunch decides what questions to ask and how many; you decide how to say them. ${level === "quick" ? "Keep phrasing brief and give the person room to answer." : level === "deep" || level === "thorough" ? "Give the person room to elaborate and preserve Brunch's pauses between topics." : "Use concise, natural phrasing and give the person room to finish."} Relay Brunch's closing turn faithfully; never add a question or invent missing facts, ranges or units.`;
};

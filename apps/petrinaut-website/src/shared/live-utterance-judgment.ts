/** Wire types shared by the server and browser. Text fields must never be logged. */
export const utteranceContributions = [
  "interview_content",
  "social_or_backchannel",
  "relay_request",
  "control",
  "restates_assistant",
  "no_content",
] as const;

export type UtteranceContribution = (typeof utteranceContributions)[number];

/** Enforcement requires a separate decision after the log-only experiment. */
export type UtteranceJudgmentMode = "off" | "log";

export interface UtteranceJudgmentState {
  readonly transcript: string;
  /** Last Brunch prose successfully offered to Live, not proof it was played. */
  readonly relayedBrunchText: string | null;
}

export interface UtteranceJudgment {
  readonly contribution: UtteranceContribution;
  readonly confidence: number;
}

export const isUtteranceJudgment = (
  value: unknown,
): value is UtteranceJudgment =>
  typeof value === "object" &&
  value !== null &&
  "contribution" in value &&
  utteranceContributions.includes(
    value.contribution as UtteranceContribution,
  ) &&
  "confidence" in value &&
  typeof value.confidence === "number" &&
  Number.isFinite(value.confidence) &&
  value.confidence >= 0 &&
  value.confidence <= 1;

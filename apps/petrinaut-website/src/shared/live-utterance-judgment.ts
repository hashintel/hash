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

export type WithheldContribution = Exclude<
  UtteranceContribution,
  "interview_content"
>;

/** Enforcement is a local and preview trial, not a production rollout. */
export type UtteranceJudgmentMode = "off" | "log" | "enforce";

/** Longest finalized transcript Live submits, in UTF-16 code units. Also bounds judgment context. */
export const maxUtteranceTextLength = 32_000;

/** Trial setting: judgments below this confidence never withhold. */
export const utteranceWithholdConfidence = 0.8;

/** Trial setting: enforcement submits unjudged input after this wait. Bounds classification, not composer admission. */
export const utteranceJudgmentDeadlineMs = 1_000;

/** Browser measurement window for the log-only latency tail, not an enforcement deadline. */
export const utteranceJudgmentTimeoutMs = 10_000;

/** Server safety bound, just beyond the browser window. */
export const utteranceJudgmentUpstreamTimeoutMs =
  utteranceJudgmentTimeoutMs + 2_000;

export interface UtteranceJudgmentState {
  readonly transcript: string;
  /** Last Brunch prose successfully offered to Live, not proof it was played. */
  readonly offeredBrunchText: string | null;
  /** Latest finalized canonical assistant turn; may contain a question. */
  readonly currentInterviewQuestion?: string | null;
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

/** The trial withhold rule, shared by log-mode recommendations and enforcement. */
export const shouldWithholdUtterance = (
  judgment: UtteranceJudgment | null,
): judgment is UtteranceJudgment & {
  readonly contribution: WithheldContribution;
} =>
  judgment !== null &&
  judgment.confidence >= utteranceWithholdConfidence &&
  judgment.contribution !== "interview_content";

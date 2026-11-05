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

/** Observation only: judgments never control submission. */
export type UtteranceJudgmentMode = "off" | "log";

/** Longest finalized transcript Live submits, in UTF-16 code units. Also bounds judgment context. */
export const maxUtteranceTextLength = 32_000;

/** Judgments below this confidence never recommend withholding. */
export const utteranceWithholdConfidence = 0.8;

/** Browser measurement window for the log-only latency tail, not an enforcement deadline. */
export const utteranceJudgmentTimeoutMs = 10_000;

/** Server safety bound, just beyond the browser window. */
export const utteranceJudgmentUpstreamTimeoutMs =
  utteranceJudgmentTimeoutMs + 2_000;

export interface UtteranceJudgmentState {
  readonly transcript: string;
  /** Last Brunch prose successfully offered to Live, not proof it was played. */
  readonly offeredBrunchText: string | null;
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

/** The withhold rule log mode records as its recommendation. */
export const shouldWithholdUtterance = (
  judgment: UtteranceJudgment | null,
): boolean =>
  judgment !== null &&
  judgment.confidence >= utteranceWithholdConfidence &&
  judgment.contribution !== "interview_content";

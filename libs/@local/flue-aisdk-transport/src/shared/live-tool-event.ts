import type { FlueConversationSettlement } from "@flue/sdk";

type SubmissionOutcome = FlueConversationSettlement["outcome"];

/** Every Flue outcome, for runtime parsing; checked against Flue in both directions. */
const submissionOutcomes = [
  "aborted",
  "completed",
  "failed",
] as const satisfies readonly SubmissionOutcome[];

type UnparsedOutcome = Exclude<
  SubmissionOutcome,
  (typeof submissionOutcomes)[number]
>;
const _everyOutcomeParsed: [UnparsedOutcome] extends [never] ? true : never =
  true;

const isSubmissionOutcome = (value: unknown): value is SubmissionOutcome =>
  submissionOutcomes.some((outcome) => outcome === value);

/**
 * The route segment of the live channel: the client reads
 * `<conversation URL>/<segment>?submissionId=<id>`, and a host must serve
 * `liveToolResponse` there, behind the conversation's own authorization.
 */
export const liveToolRouteSegment = "live";

/** One frame of the live tool-input side channel, as the server sends it. */
export type LiveToolEvent =
  | LiveToolCallEvent<"tool-input-start">
  | (LiveToolCallEvent<"tool-input-delta"> & {
      readonly inputTextDelta: string;
    })
  | LiveToolTurnFinishedEvent
  | LiveToolSubmissionFinishedEvent;

type LiveToolCorrelation = {
  readonly instanceId: string;
  readonly sequence: number;
  readonly submissionId: string;
  readonly turnId: string;
  readonly v: 1;
};

type LiveToolCallEvent<Kind extends string> = LiveToolCorrelation & {
  readonly kind: Kind;
  readonly toolCallId: string;
  readonly toolName: string;
};

type LiveToolTurnFinishedEvent = LiveToolCorrelation & {
  readonly kind: "turn-finished";
};

type LiveToolSubmissionFinishedEvent = Omit<LiveToolCorrelation, "turnId"> & {
  readonly kind: "submission-finished";
  readonly outcome: SubmissionOutcome;
};

/** A live event before the broadcaster assigns its sequence and version. */
export type LiveToolEventInput =
  | Omit<LiveToolCallEvent<"tool-input-start">, "sequence" | "v">
  | Omit<
      LiveToolCallEvent<"tool-input-delta"> & {
        readonly inputTextDelta: string;
      },
      "sequence" | "v"
    >
  | Omit<LiveToolTurnFinishedEvent, "sequence" | "v">
  | Omit<LiveToolSubmissionFinishedEvent, "sequence" | "v">;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (
  record: Record<string, unknown>,
  key: string,
): string | undefined => {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

export const parseLiveToolEvent = (value: unknown): LiveToolEvent => {
  if (
    !isRecord(value) ||
    value.v !== 1 ||
    !Number.isSafeInteger(value.sequence) ||
    (value.sequence as number) < 0
  ) {
    throw new Error("The live tool stream delivered an invalid event.");
  }
  const instanceId = nonEmptyString(value, "instanceId");
  const submissionId = nonEmptyString(value, "submissionId");
  const kind = nonEmptyString(value, "kind");
  if (instanceId === undefined || submissionId === undefined) {
    throw new Error("The live tool stream event is missing its correlation.");
  }
  const base = {
    instanceId,
    sequence: value.sequence as number,
    submissionId,
    v: 1 as const,
  };

  if (kind === "submission-finished") {
    const outcome = value.outcome;
    if (!isSubmissionOutcome(outcome)) {
      throw new Error("The live tool stream terminal outcome is invalid.");
    }
    return { ...base, kind, outcome };
  }

  const turnId = nonEmptyString(value, "turnId");
  if (turnId === undefined) {
    throw new Error("The live tool stream event is missing its turn.");
  }
  if (kind === "turn-finished") return { ...base, kind, turnId };

  const toolCallId = nonEmptyString(value, "toolCallId");
  const toolName = nonEmptyString(value, "toolName");
  if (toolCallId === undefined || toolName === undefined) {
    throw new Error("The live tool stream event is missing its tool call.");
  }
  if (kind === "tool-input-start") {
    return { ...base, kind, toolCallId, toolName, turnId };
  }
  if (kind === "tool-input-delta" && typeof value.inputTextDelta === "string") {
    return {
      ...base,
      kind,
      inputTextDelta: value.inputTextDelta,
      toolCallId,
      toolName,
      turnId,
    };
  }
  throw new Error("The live tool stream event kind is invalid.");
};

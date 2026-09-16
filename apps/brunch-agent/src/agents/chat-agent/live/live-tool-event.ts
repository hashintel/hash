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

export type LiveToolTurnFinishedEvent = LiveToolCorrelation & {
  readonly kind: "turn-finished";
};

export type LiveToolSubmissionFinishedEvent = Omit<
  LiveToolCorrelation,
  "turnId"
> & {
  readonly kind: "submission-finished";
  readonly outcome: "aborted" | "completed" | "failed";
};

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

import type { FlueObservation, ModelRequest } from "@flue/runtime";

export const TURN_TIMING_PURPOSES = ["interview", "sweep", "repair"] as const;

export type TurnTimingPurpose = (typeof TURN_TIMING_PURPOSES)[number];

export interface TurnTimingRecord {
  readonly interviewerTurn: number;
  readonly flueTurnId: string;
  readonly purpose: TurnTimingPurpose;
  readonly durationMs: number;
}

export interface TurnTimingRecorder {
  startInterviewerTurn(interviewerTurn: number): void;
  observe(event: FlueObservation): void;
  forInterviewerTurn(interviewerTurn: number): readonly TurnTimingRecord[];
  all(): readonly TurnTimingRecord[];
}

const signalPurpose = (
  request: ModelRequest,
): TurnTimingPurpose | undefined => {
  const latestMessage = request.input.messages.at(-1);
  if (latestMessage?.role !== "user") return undefined;
  const content =
    typeof latestMessage.content === "string"
      ? latestMessage.content
      : latestMessage.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("\n");
  if (content.startsWith("<sweep-repair")) return "repair";
  if (content.startsWith("<settlement-check")) return "sweep";
  return undefined;
};

export const createTurnTimingRecorder = (): TurnTimingRecorder => {
  let currentInterviewerTurn: number | undefined;
  const activePromptOperationIds: string[] = [];
  const nestedPromptOperationIds = new Set<string>();
  const purposeByOperation = new Map<string, TurnTimingPurpose>();
  const purposeByFlueTurn = new Map<string, TurnTimingPurpose>();
  const timingRecords: TurnTimingRecord[] = [];

  return {
    startInterviewerTurn(interviewerTurn) {
      currentInterviewerTurn = interviewerTurn;
    },
    observe(event) {
      if (
        event.type === "operation_start" &&
        event.operationKind === "prompt"
      ) {
        const parentOperationId = activePromptOperationIds.at(-1);
        if (parentOperationId !== undefined) {
          nestedPromptOperationIds.add(event.operationId);
          purposeByOperation.set(
            event.operationId,
            purposeByOperation.get(parentOperationId) === "repair"
              ? "repair"
              : "sweep",
          );
        }
        activePromptOperationIds.push(event.operationId);
        return;
      }
      if (event.type === "operation") {
        const activeIndex = activePromptOperationIds.lastIndexOf(
          event.operationId,
        );
        if (activeIndex !== -1) activePromptOperationIds.splice(activeIndex, 1);
        nestedPromptOperationIds.delete(event.operationId);
        purposeByOperation.delete(event.operationId);
        return;
      }
      if (event.type === "turn_request") {
        const operationPurpose =
          event.operationId === undefined
            ? undefined
            : purposeByOperation.get(event.operationId);
        const purpose =
          event.operationId !== undefined &&
          nestedPromptOperationIds.has(event.operationId)
            ? (operationPurpose ?? "sweep")
            : event.purpose === "agent"
              ? (signalPurpose(event.request) ?? "interview")
              : (operationPurpose ?? "interview");
        purposeByFlueTurn.set(event.turnId, purpose);
        if (
          event.operationId !== undefined &&
          !nestedPromptOperationIds.has(event.operationId)
        ) {
          purposeByOperation.set(event.operationId, purpose);
        }
        return;
      }
      if (event.type !== "turn" || currentInterviewerTurn === undefined) {
        return;
      }
      timingRecords.push({
        interviewerTurn: currentInterviewerTurn,
        flueTurnId: event.turnId,
        purpose:
          purposeByFlueTurn.get(event.turnId) ??
          (event.operationId === undefined
            ? undefined
            : purposeByOperation.get(event.operationId)) ??
          "interview",
        durationMs: event.durationMs,
      });
      purposeByFlueTurn.delete(event.turnId);
    },
    forInterviewerTurn(interviewerTurn) {
      return timingRecords.filter(
        (timingRecord) => timingRecord.interviewerTurn === interviewerTurn,
      );
    },
    all() {
      return timingRecords;
    },
  };
};

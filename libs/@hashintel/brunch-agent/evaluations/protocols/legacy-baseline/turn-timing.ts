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

const toolResultStatus = (event: FlueObservation): string | undefined => {
  if (event.type !== "tool") return undefined;
  const result = event.effectiveResult ?? event.result;
  if (typeof result !== "object" || result === null) return undefined;
  const output = "output" in result ? result.output : result;
  if (typeof output !== "object" || output === null) return undefined;
  return "status" in output && typeof output.status === "string"
    ? output.status
    : undefined;
};

export const createTurnTimingRecorder = (): TurnTimingRecorder => {
  let currentInterviewerTurn: number | undefined;
  const activePromptOperationIds: string[] = [];
  const nestedPromptOperationIds = new Set<string>();
  const repairingPromptOperationIds = new Set<string>();
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
            repairingPromptOperationIds.has(parentOperationId) ||
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
        repairingPromptOperationIds.delete(event.operationId);
        purposeByOperation.delete(event.operationId);
        return;
      }
      if (event.type === "tool" && event.toolName === "brunch_sweep") {
        const activeOperationId = activePromptOperationIds.at(-1);
        if (activeOperationId === undefined) return;
        const status = toolResultStatus(event);
        if (status === undefined) return;
        if (status === "refused") {
          repairingPromptOperationIds.add(activeOperationId);
          purposeByOperation.set(activeOperationId, "repair");
        } else {
          purposeByOperation.set(
            activeOperationId,
            repairingPromptOperationIds.has(activeOperationId)
              ? "repair"
              : "sweep",
          );
          repairingPromptOperationIds.delete(activeOperationId);
        }
        return;
      }
      if (event.type === "turn_request") {
        const operationId =
          event.operationId !== undefined &&
          purposeByOperation.has(event.operationId)
            ? event.operationId
            : activePromptOperationIds.at(-1);
        const operationPurpose =
          operationId === undefined
            ? undefined
            : purposeByOperation.get(operationId);
        const purpose =
          operationId !== undefined && nestedPromptOperationIds.has(operationId)
            ? (operationPurpose ?? "sweep")
            : event.purpose === "agent"
              ? (signalPurpose(event.request) ??
                operationPurpose ??
                "interview")
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

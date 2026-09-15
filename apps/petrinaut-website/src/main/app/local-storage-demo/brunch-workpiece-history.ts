import { canonicalContent } from "@hashintel/brunch-agent-plugin-sdcpn";

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const workpieceMutationToolNames: ReadonlySet<string> = new Set([
  "mutate_workpiece",
  "update_workpiece",
]);
const workpieceReadToolNames: ReadonlySet<string> = new Set([
  "read_workpiece",
  "brunch_workpiece",
]);
const workpieceQueryToolNames: ReadonlySet<string> = new Set([
  "query_workpiece",
  "brunch_why",
]);

export type BrunchWorkpieceHistoryMessage = {
  readonly role: string;
  readonly purpose: string;
  readonly parts: readonly unknown[];
};

export type BrunchWorkpieceHistory = {
  readonly activityIdentities: readonly string[];
  readonly report:
    | {
        readonly toolCallId: string;
        readonly source: "settlement" | "query";
        readonly workpiece: Record<string, unknown> | undefined;
      }
    | undefined;
  readonly stateChangedSinceReport: boolean;
  readonly why:
    | { readonly toolCallId: string; readonly output: Record<string, unknown> }
    | undefined;
  readonly whyPredatesSettlement: boolean;
};

/**
 * Folds successful tool results only. A settlement body is read from the
 * input solely when its output binds that same call (`revisionId ===
 * toolCallId`); failed, pending or unbound inputs never become state.
 */
export const foldBrunchWorkpieceHistory = (
  messages: readonly BrunchWorkpieceHistoryMessage[],
  binding: {
    readonly conversationId: string;
    readonly documentId: string;
    readonly incarnationId: string;
  },
): BrunchWorkpieceHistory => {
  let report: BrunchWorkpieceHistory["report"];
  let why: BrunchWorkpieceHistory["why"];
  let whyPredatesSettlement = false;
  let stateChangedSinceReport = false;
  const activityIdentities = new Set<string>();

  for (const message of messages) {
    if (message.role !== "assistant" || message.purpose !== "assistant") {
      continue;
    }
    for (const part of message.parts) {
      if (
        !isRecord(part) ||
        part.type !== "dynamic-tool" ||
        part.state !== "output-available" ||
        typeof part.toolCallId !== "string" ||
        typeof part.toolName !== "string"
      ) {
        continue;
      }
      if (workpieceMutationToolNames.has(part.toolName)) {
        stateChangedSinceReport = true;
        if (why) {
          whyPredatesSettlement = true;
        }
        // A successful settlement output carries identity only; the body is
        // the canonical input the server hashed and accepted under that
        // toolCallId. Neither side is state by itself.
        if (
          isRecord(part.output) &&
          isRecord(part.input) &&
          part.output.revisionId === part.toolCallId &&
          typeof part.output.sha256 === "string" &&
          typeof part.output.ordinal === "number" &&
          typeof part.input.markdown === "string"
        ) {
          activityIdentities.add(part.toolCallId);
          report = {
            toolCallId: part.toolCallId,
            source: "settlement",
            workpiece: { ...part.output, markdown: part.input.markdown },
          };
          stateChangedSinceReport = false;
        }
      }
      if (
        (workpieceReadToolNames.has(part.toolName) ||
          workpieceQueryToolNames.has(part.toolName)) &&
        isRecord(part.output)
      ) {
        if (
          workpieceQueryToolNames.has(part.toolName) &&
          canonicalContent(part.output.binding) !== canonicalContent(binding)
        ) {
          continue;
        }
        report = {
          toolCallId: part.toolCallId,
          source: "query",
          workpiece: isRecord(part.output.currentWorkpiece)
            ? part.output.currentWorkpiece
            : undefined,
        };
        stateChangedSinceReport = false;
        if (workpieceQueryToolNames.has(part.toolName)) {
          why = { toolCallId: part.toolCallId, output: part.output };
          whyPredatesSettlement = false;
        }
      }
    }
  }

  return {
    activityIdentities: [...activityIdentities],
    report,
    stateChangedSinceReport,
    why,
    whyPredatesSettlement,
  };
};

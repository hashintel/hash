import * as v from "valibot";

import { brunchTools } from "../constants";
import {
  deriveNotes,
  ledgerCommitOutputSchema,
  recordedCommitInputSchema,
  type LedgerCommit,
  type LedgerNote,
} from "./notes";

/** Structural view of a conversation history; Flue and AI SDK messages both fit. */
export interface LedgerHistoryMessage {
  readonly id: string;
  readonly role: string;
  readonly purpose?: string;
  readonly parts: readonly unknown[];
}

export interface LedgerHistory {
  readonly messages: readonly LedgerHistoryMessage[];
}

const toolPartSchema = v.object({
  type: v.literal("dynamic-tool"),
  toolName: v.string(),
  toolCallId: v.string(),
  state: v.string(),
  input: v.optional(v.unknown()),
  output: v.optional(v.unknown()),
});

type ToolPart = v.InferOutput<typeof toolPartSchema>;

export interface LedgerCall {
  readonly part: ToolPart;
  readonly messageIndex: number;
  /**
   * Whether an earlier `ledger_commit` in the same response has not settled.
   * A response's steps run in order, so only a sibling in the same proposal
   * can still be running.
   */
  readonly followsUnsettledCall: boolean;
  readonly afterMessageId?: string;
}

const isSettled = (part: ToolPart) => part.state.startsWith("output-");

/** Every `ledger_commit` call in canonical order, whatever its state. */
export const ledgerCalls = (history: LedgerHistory): LedgerCall[] => {
  let afterMessageId: string | undefined;
  return history.messages.flatMap((message, messageIndex) => {
    if (message.role === "user" && (message.purpose ?? "user") === "user") {
      afterMessageId = message.id;
      return [];
    }
    if (message.role !== "assistant") return [];
    const parts = message.parts.flatMap((candidate) => {
      const parsed = v.safeParse(toolPartSchema, candidate);
      return parsed.success &&
        parsed.output.toolName === brunchTools.ledgerCommit
        ? [parsed.output]
        : [];
    });
    return parts.map((part, index): LedgerCall => {
      const followsUnsettledCall = parts
        .slice(0, index)
        .some((earlier) => !isSettled(earlier));
      return afterMessageId === undefined
        ? { part, messageIndex, followsUnsettledCall }
        : { part, messageIndex, followsUnsettledCall, afterMessageId };
    });
  });
};

/**
 * Fold accepted commits in canonical order. A call counts only when its
 * recorded input and successful output agree on the call identity and on the
 * Note addresses the input yields after the commits before it. Pending,
 * refused, failed, malformed and disagreeing calls contribute nothing.
 * `before` stops at the named call without including it.
 */
export const reconstructLedger = (
  history: LedgerHistory,
  before?: string,
): LedgerCommit[] => {
  const commits: LedgerCommit[] = [];
  const notes: LedgerNote[] = [];
  for (const call of ledgerCalls(history)) {
    if (call.part.toolCallId === before) break;
    if (call.part.state !== "output-available") continue;
    const input = v.safeParse(recordedCommitInputSchema, call.part.input);
    const output = v.safeParse(ledgerCommitOutputSchema, call.part.output);
    if (!input.success || !output.success) continue;
    if (
      output.output.status !== "recorded" ||
      output.output.commitId !== call.part.toolCallId
    )
      continue;
    const derived = deriveNotes(notes, input.output.changes);
    if (!("notes" in derived)) continue;
    const recorded = output.output.notes;
    const agrees =
      recorded.length === derived.notes.length &&
      derived.notes.every(
        (note, index) =>
          recorded[index]?.address === note.address &&
          recorded[index].supersedes === note.supersedes,
      );
    if (!agrees) continue;
    commits.push({
      commitId: call.part.toolCallId,
      revision: commits.length + 1,
      ...(call.afterMessageId === undefined
        ? {}
        : { afterMessageId: call.afterMessageId }),
      notes: derived.notes,
    });
    notes.push(...derived.notes);
  }
  return commits;
};

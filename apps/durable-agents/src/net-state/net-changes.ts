/**
 * The net's recorded changes, from the conversation's browser-call records:
 * the record by `toolCallId` in place of Brunch's settled tool part, and the
 * call's issue position (its assistant entry, then its index there) in place
 * of the message and part indexes. What a call shows of the net and which
 * element it changed are the library's (`petrinaut/net-changes.ts` in
 * `@hashintel/brunch-agent`), as they are for Brunch.
 */
import {
  browserToolFacts,
  parseClientToolResultMetadata,
  readRecordedCall,
} from "@hashintel/brunch-agent";

import {
  type BrowserCallRecord,
  hasCommittedResult,
} from "../browser-call/browser-call";

import type { EntryId } from "@earendil-works/pi-durable";
import type { NetCallCore } from "@hashintel/brunch-agent";

export interface NetCall extends NetCallCore {
  /** The `pi.assistant` entry that issued the call. */
  readonly issuedEntry: EntryId;
  /** The call's index among that entry's tool calls. */
  readonly callIndex: number;
}

/** Whether `left` was issued before `right`. */
export const issuedBefore = (
  left: Pick<NetCall, "issuedEntry" | "callIndex">,
  right: Pick<NetCall, "issuedEntry" | "callIndex">,
) =>
  left.issuedEntry < right.issuedEntry ||
  (left.issuedEntry === right.issuedEntry && left.callIndex < right.callIndex);

/**
 * The net calls the browser committed a result for, in issue order: an
 * aborted turn's result is never delivered, but the browser applied it. A
 * call recorded without its issue position, before positions were recorded,
 * is left out. Each call is under the tool of today that takes it, and in
 * that tool's keys: a conversation may have recorded it under older ones.
 */
export const netCalls = (
  calls: Readonly<Record<string, BrowserCallRecord>>,
): NetCall[] =>
  Object.values(calls)
    .flatMap((record) => {
      const { issuedEntry, callIndex } = record;
      const { toolName, input } = readRecordedCall(
        record.toolName,
        record.input,
      );
      if (
        !hasCommittedResult(record) ||
        !browserToolFacts(toolName).runsOnNet ||
        issuedEntry === undefined ||
        callIndex === undefined
      )
        return [];
      const metadata = parseClientToolResultMetadata(record.metadata);
      return [
        {
          toolCallId: record.toolCallId,
          toolName,
          input,
          output: record.output,
          revisionBefore: metadata?.documentRevision.before,
          revisionAfter: metadata?.documentRevision.after,
          metadata: record.metadata,
          issuedEntry,
          callIndex,
        },
      ];
    })
    .toSorted((left, right) =>
      issuedBefore(left, right) ? -1 : issuedBefore(right, left) ? 1 : 0,
    );

import {
  durableHistoryPartTypes,
  netResultView,
} from "@hashintel/brunch-agent";

import {
  readSuccessorBrowserCalls,
  type SuccessorBrowserCall,
} from "../successor/successor-browser-calls";
import { readSuccessorHistory } from "../successor/successor-history";

import type { SuccessorConversation } from "../successor/successor-endpoints";
import type { UIMessage } from "ai";

/** The revision a hand-edit note's data names. */
const noteRevision = (part: UIMessage["parts"][number]) => {
  const data: unknown = "data" in part ? part.data : undefined;
  return typeof data === "object" &&
    data !== null &&
    "revision" in data &&
    typeof data.revision === "string"
    ? data.revision
    : undefined;
};

/**
 * The revision a conversation on the durable agents server last showed the
 * model or told it of, as the server's own view of the net folds the same
 * conversation (`visibleNetView`): the latest net-showing browser result the
 * model read, or a hand-edit note after it; none when it never saw the net.
 *
 * `history` orders results and notes. Its parts carry a result's output as
 * presented, never the metadata that names the revision it showed, so the
 * revision comes from `calls`, the server's records, read as the server
 * renders a result for the model (`netResultView`). A result counts only
 * where history shows it delivered and its record says the turn read it
 * (`settled`): a discarded call's outcome never reached the model.
 *
 * One divergence remains: a result Pi's output bound cut is no view for the
 * server, but history doesn't say it was cut. The next change the model
 * issues then fails as stale, and the model reads the net again.
 */
export const shownRevisionOf = (
  history: readonly UIMessage[],
  calls: readonly SuccessorBrowserCall[],
): string | undefined => {
  const records = new Map(calls.map((call) => [call.toolCallId, call]));
  let shown: string | undefined;
  for (const { parts } of history)
    for (const part of parts) {
      if (part.type === durableHistoryPartTypes.handEdit) {
        shown = noteRevision(part) ?? shown;
        continue;
      }
      if (!("toolCallId" in part) || part.state !== "output-available")
        continue;
      const record = records.get(part.toolCallId);
      if (record?.status !== "settled") continue;
      shown =
        netResultView(record.toolName, record.metadata)?.revision ?? shown;
    }
  return shown;
};

/**
 * The revision `conversation` last showed the model or told it of
 * (`shownRevisionOf`), from its history and call records as the server
 * answers them now; none for a conversation it doesn't have.
 */
export const readShownRevision = async (
  conversation: SuccessorConversation,
  signal?: AbortSignal,
): Promise<string | undefined> => {
  const [history, calls] = await Promise.all([
    readSuccessorHistory(conversation, signal),
    readSuccessorBrowserCalls(conversation, signal),
  ]);
  return history.found ? shownRevisionOf(history.messages, calls) : undefined;
};

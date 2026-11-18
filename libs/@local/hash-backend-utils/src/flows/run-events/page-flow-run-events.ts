import type { FlowRunEvent } from "@local/hash-isomorphic-utils/flows/run-events";

const defaultFlowRunEventsPageSize = 500;
const maxFlowRunEventsPageSize = 2_000;

type FlowRunEventsCursor = { v: 1; runId: string; position: string };

type FlowRunEventsPage = {
  events: FlowRunEvent[];
  endCursor: string | null;
  hasNextPage: boolean;
  runId: string;
  restarted: boolean;
  keptUpTo: string | null;
};

const positionPattern = /^\d+\.\d+$/;

const encodeFlowRunEventsCursor = (runId: string, position: string): string =>
  Buffer.from(
    JSON.stringify({
      v: 1,
      runId,
      position,
    } satisfies FlowRunEventsCursor),
  ).toString("base64url");

const decodeCursor = (cursor: string): FlowRunEventsCursor => {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new Error(`Invalid flow run events cursor: ${cursor}`);
  }

  if (
    typeof decoded !== "object" ||
    decoded === null ||
    !("v" in decoded) ||
    decoded.v !== 1 ||
    !("runId" in decoded) ||
    typeof decoded.runId !== "string" ||
    !("position" in decoded) ||
    typeof decoded.position !== "string" ||
    !positionPattern.test(decoded.position)
  ) {
    throw new Error(`Invalid flow run events cursor: ${cursor}`);
  }

  return { v: 1, runId: decoded.runId, position: decoded.position };
};

const comparePositions = (left: string, right: string) => {
  const [leftEventId = 0, leftIndex = 0] = left.split(".").map(Number);
  const [rightEventId = 0, rightIndex = 0] = right.split(".").map(Number);

  return leftEventId - rightEventId || leftIndex - rightIndex;
};

/**
 * A page of a run's events, after a cursor from an earlier page.
 *
 * A reset starts a new run with the history up to the reset point, so a cursor from the run it was reset from is
 * only good up to there. Past it, or from a run the current one doesn't come from, the page is `restarted`: it
 * continues after `keptUpTo`, the last event the client has that the current run kept, or starts again from the
 * first event when it kept none.
 */
export const pageFlowRunEvents = ({
  events,
  runId,
  after,
  first,
}: {
  events: FlowRunEvent[];
  runId: string;
  after?: string | null;
  first?: number | null;
}): FlowRunEventsPage => {
  const pageSize = Math.min(
    first ?? defaultFlowRunEventsPageSize,
    maxFlowRunEventsPageSize,
  );

  if (pageSize < 1) {
    throw new Error(
      `Can't ask for fewer than 1 flow run event, but asked for ${pageSize}`,
    );
  }

  const indexAfter = (position: string) => {
    const index = events.findIndex(
      (event) => comparePositions(event.position, position) > 0,
    );
    return index === -1 ? events.length : index;
  };

  let start = 0;
  let restarted = false;
  let keptUpTo: string | null = null;

  if (after) {
    const cursor = decodeCursor(after);

    if (cursor.runId === runId) {
      start = indexAfter(cursor.position);
    } else {
      const resetIndex = events.findIndex(
        (event) =>
          event.kind === "runReset" && event.fromRunId === cursor.runId,
      );
      const lastKeptEvent =
        resetIndex === -1 ? undefined : events[resetIndex - 1];

      if (!lastKeptEvent) {
        restarted = true;
      } else if (
        comparePositions(cursor.position, lastKeptEvent.position) <= 0
      ) {
        start = indexAfter(cursor.position);
      } else {
        restarted = true;
        keptUpTo = lastKeptEvent.position;
        start = resetIndex;
      }
    }
  }

  const pageEvents = events.slice(start, start + pageSize);
  const lastEvent = pageEvents.at(-1);

  return {
    events: pageEvents,
    endCursor: lastEvent
      ? encodeFlowRunEventsCursor(runId, lastEvent.position)
      : events.length === 0
        ? null
        : (after ?? null),
    hasNextPage: start + pageSize < events.length,
    runId,
    restarted,
    keptUpTo,
  };
};

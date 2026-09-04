import { describe, expect, it } from "vitest";

import { createAbortController } from "../environment";
import { createOptimizationRunLog } from "./run-log";

import type { PetrinautOptimizationEvent } from "../optimization";

const collect = async (
  iterable: AsyncIterable<PetrinautOptimizationEvent>,
): Promise<PetrinautOptimizationEvent[]> => {
  const events: PetrinautOptimizationEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
};

const trial = (
  index: number,
): Parameters<ReturnType<typeof createOptimizationRunLog>["append"]>[0] => ({
  type: "trial",
  trial: index,
  parameters: { rate: index },
  objective: index,
  state: "complete",
  best: { trial: index, parameters: { rate: index }, objective: index },
});

const complete = {
  type: "complete",
  requestedTrials: 2,
  completedTrials: 2,
  prunedTrials: 0,
  failedTrials: 0,
  best: null,
} as const;

describe("createOptimizationRunLog", () => {
  it("stamps dense sequence numbers from 1 and settles on a terminal event", () => {
    const log = createOptimizationRunLog();

    expect(log.append({ type: "started", requestedTrials: 2 }).seq).toBe(1);
    expect(log.append(trial(0)).seq).toBe(2);
    expect(log.settled).toBe(false);
    expect(log.append(complete).seq).toBe(3);
    expect(log.settled).toBe(true);
    expect(log.events.map((event) => event.seq)).toEqual([1, 2, 3]);
    expect(() => log.append(trial(1))).toThrow(
      "a settled optimization run log accepts only a started event",
    );
  });

  it("begins a new segment with a started event after a terminal one", () => {
    const log = createOptimizationRunLog();
    log.append({ type: "started", requestedTrials: 2 });
    log.append(complete);

    expect(log.append({ type: "started", requestedTrials: 4 }).seq).toBe(3);
    expect(log.settled).toBe(false);
    expect(log.append(trial(2)).seq).toBe(4);
  });

  it("replays the stored events past the cursor, then tails until the terminal event", async () => {
    const log = createOptimizationRunLog();
    log.append({ type: "started", requestedTrials: 2 });
    log.append(trial(0));

    const replay = collect(log.replay({ cursor: 1 }));
    await Promise.resolve();
    log.append(trial(1));
    log.append(complete);

    expect((await replay).map((event) => [event.type, event.seq])).toEqual([
      ["trial", 2],
      ["trial", 3],
      ["complete", 4],
    ]);
  });

  it("ends a replay at the first terminal event after the cursor", async () => {
    const log = createOptimizationRunLog();
    log.append({ type: "started", requestedTrials: 1 });
    log.append(trial(0));
    log.append(complete);
    log.append({ type: "started", requestedTrials: 2 });
    log.append(trial(1));
    log.append({ ...complete, requestedTrials: 2 });

    expect((await collect(log.replay())).map((event) => event.seq)).toEqual([
      1, 2, 3,
    ]);
    expect(
      (await collect(log.replay({ cursor: 3 }))).map((event) => event.seq),
    ).toEqual([4, 5, 6]);
    expect(
      (await collect(log.replay({ cursor: 2 }))).map((event) => event.seq),
    ).toEqual([3]);
  });

  it("tails a segment begun after the cursor until its terminal event", async () => {
    const log = createOptimizationRunLog();
    log.append({ type: "started", requestedTrials: 1 });
    log.append(complete);
    log.append({ type: "started", requestedTrials: 2 });

    const replay = collect(log.replay({ cursor: 2 }));
    await Promise.resolve();
    log.append(trial(1));
    log.append({ ...complete, requestedTrials: 2 });

    expect((await replay).map((event) => [event.type, event.seq])).toEqual([
      ["started", 3],
      ["trial", 4],
      ["complete", 5],
    ]);
  });

  it("ends at once when attached past the end of a settled log", async () => {
    const log = createOptimizationRunLog();
    log.append({ type: "started", requestedTrials: 2 });
    log.append(complete);

    expect(await collect(log.replay({ cursor: 2 }))).toEqual([]);
    expect(await collect(log.replay())).toHaveLength(2);
  });

  it("notifies subscribers of each appended event", () => {
    const log = createOptimizationRunLog();
    const seen: number[] = [];
    const unsubscribe = log.subscribe((event) => {
      seen.push(event.seq ?? -1);
    });

    log.append({ type: "started", requestedTrials: 2 });
    unsubscribe();
    log.append(trial(0));

    expect(seen).toEqual([1]);
  });

  it("aborts a tailing replay with an AbortError", async () => {
    const log = createOptimizationRunLog();
    log.append({ type: "started", requestedTrials: 2 });
    const controller = createAbortController();

    const replay = collect(log.replay({ signal: controller.signal }));
    await Promise.resolve();
    controller.abort();

    await expect(replay).rejects.toMatchObject({ name: "AbortError" });
  });
});

/**
 * The crash-loop guard on a task whose abort handler is cut off on every
 * open. A "crash" is a second Harness opening the storage while the first
 * still runs the task, as after a process kill.
 */
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  createRegistry,
  defineExtension,
  defineTask,
  Harness,
  MemoryStorage,
} from "@earendil-works/pi-durable";
import { expect, test, vi } from "vitest";

import { scriptedModel } from "../../../../test/scripted-model";
import { CrashLoopEntry } from "../shared/crash-loop-entry";
import { guardCrashLoops } from "./crash-loop-guard";

const context = BACKGROUND_CONTEXT;

const untilAborted = (signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    signal.addEventListener("abort", () => resolve());
  });

test("a task whose abort handler a crash cuts off on every open is recorded once", async () => {
  let abortStarted = Promise.withResolvers<void>();
  const Stuck = defineTask<object, { phase: "run" }, null>({
    name: "test.stuck",
    version: 1,
    initial: () => ({ phase: "run" }),
    phases: {
      run: async (_task, runtime) => {
        await untilAborted(runtime.signal);
        throw new Error("aborted");
      },
    },
    abort: async (_task, runtime) => {
      abortStarted.resolve();
      await untilAborted(runtime.signal);
    },
  });
  const storage = Object.assign(new MemoryStorage(), { close: async () => {} });
  const { models, model } = scriptedModel([]);
  const harnesses: Harness[] = [];
  const open = async () => {
    const registry = createRegistry();
    registry.install(defineExtension({ name: "stuck", tasks: [Stuck] }));
    const harness = await Harness.open(
      storage,
      { models, registry, settings: { restartLimit: Infinity } },
      context,
    );
    harnesses.push(harness);
    return harness;
  };
  const crashLoopEntries = async (harness: Harness) => {
    const root = await harness.conversation(rootId, context);
    const { items } = await root!.entries({}, 100, undefined, context);
    return items.filter((entry) => CrashLoopEntry.is(entry));
  };

  const first = await open();
  const root = await first.root(context, { agent: { model } });
  const rootId = root.id;
  await root.commit(
    (tx) => tx.createTask(Stuck, {}, { ownership: { kind: "conversation" } }),
    context,
  );
  first.resume();
  await vi.waitFor(async () => {
    const { tasks } = await first.inspect(context);
    expect(tasks.map(({ state }) => state.kind)).toEqual(["running"]);
  });

  try {
    const guards: Promise<unknown>[] = [];
    for (let crash = 0; crash < 3; crash++) {
      abortStarted = Promise.withResolvers<void>();
      // Each open counts the invocation the one before was running as cut off.
      // eslint-disable-next-line no-await-in-loop
      const harness = await open();
      // eslint-disable-next-line no-await-in-loop
      const opened = (await harness.conversation(rootId, context))!;
      const appended = Promise.withResolvers<void>();
      const commit = opened.commit.bind(opened);
      vi.spyOn(opened, "commit").mockImplementation(async (...args) => {
        const result = await commit(...args);
        appended.resolve();
        return result;
      });
      // A guard that aborts waits for the abort handler, which never ends.
      const guard = guardCrashLoops(harness, opened, 1, context);
      guards.push(guard);
      // eslint-disable-next-line no-await-in-loop
      await Promise.race([guard, appended.promise]);
      harness.resume();
      // eslint-disable-next-line no-await-in-loop
      await abortStarted.promise;
    }

    const entries = await crashLoopEntries(harnesses.at(-1)!);
    expect(entries.map(({ data }) => data.tasks)).toEqual([
      [expect.objectContaining({ kind: "test.stuck", restarts: 1 })],
    ]);
    // Only the first open's guard aborted; the later ones found the loop recorded.
    expect(await Promise.all(guards.slice(1))).toEqual([undefined, undefined]);
  } finally {
    await Promise.all(
      harnesses.map((harness) => harness.close(context).catch(() => {})),
    );
  }
});

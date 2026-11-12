/**
 * Obligations 4 and 5 across a restart: the host closure is rebuilt with a
 * new Harness over the same SQLite file, and the generation's `tools` phase,
 * interrupted between "every tool is terminal" and the round's boundary
 * commit, runs `afterTools` again on recovery.
 *
 * "Restart" here is `Harness.close()` with the hook still pending, then a new
 * Harness over the same file in the same process. Close cancels the pending
 * hook through its context; it is not a process kill, so it does not prove
 * what an OS-level crash mid-commit leaves behind.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { awaitWithContext } from "@earendil-works/chord/context";
import {
  type EntryId,
  type Harness,
  type SubmissionId,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  allEntries,
  calls,
  context,
  fauxAssistantMessage,
  kindsOf,
  recordingModel,
  resultEntry,
} from "../support";
import {
  type HookCall,
  ok,
  openProbeHarness,
  pruneEntryKind,
  pruneRequestId,
  shownReadBacks,
} from "./support";

import type { Context } from "@earendil-works/chord";

let directory: string;
let file: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "durable-after-tools-"));
  file = join(directory, "session.sqlite");
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const responses = () =>
  recordingModel([
    calls(["change", "c0", ok("R1", "R0")]),
    calls(["change", "c1", ok("R2", "R1")]),
    fauxAssistantMessage("done"),
  ]);

/** A hook step that, on its `nth` invocation, signals and then never returns until cancelled. */
const stallOn = (nth: number) => {
  let invocations = 0;
  let signal: () => void = () => undefined;
  const reached = new Promise<void>((resolve) => {
    signal = resolve;
  });
  const step = async (_call: HookCall, hookContext: Context) => {
    invocations += 1;
    if (invocations !== nth) return;
    signal();
    await awaitWithContext(new Promise<never>(() => undefined), hookContext);
  };
  return { step, reached };
};

const submissionFor = (
  harness: Harness,
  conversationId: Parameters<Harness["conversation"]>[0],
  assistant: EntryId,
) =>
  harness.commit(
    (tx) => tx.submissionByRequest(conversationId, pruneRequestId(assistant)),
    context,
  );

describe("5: restart-safe binding and recovery", () => {
  test("stopped after the round is terminal, before the hook's write: a new Harness binds its own closure, afterTools runs again for the same round, and the write lands once", async () => {
    const { models, model, requests } = responses();
    const stall = stallOn(2);
    const first = await openProbeHarness(
      await openNodeSqliteStorage(file),
      models,
      { hook: { beforeDecide: stall.step } },
    );
    const root = await first.harness.root(context, { agent: { model } });
    const input = await root.submit({ type: "input", content: "go" }, context);
    await stall.reached;
    const before = await allEntries(root);
    const assistant = first.calls[1]!.assistant;
    expect(kindsOf(before).slice(-2)).toEqual([
      "pi.assistant(c1)",
      "pi.tool-result(c1)",
    ]);
    expect(
      await submissionFor(first.harness, root.id, assistant),
    ).toBeUndefined();
    await first.harness.close(context);

    const second = await openProbeHarness(
      await openNodeSqliteStorage(file),
      models,
    );
    try {
      // A Harness opens paused; its closure is bound before anything runs.
      expect(second.host.harness).toBe(second.harness);
      const recovered = await second.harness.submission(input.id, context);
      expect((await recovered!.wait(context)).status).toBe("done");
      // The new Harness's hook ran for the interrupted round, with the same arguments.
      expect(second.calls).toEqual([first.calls[1]]);
      const resumed = await second.harness.conversation(root.id, context);
      const entries = await allEntries(resumed!);
      expect(kindsOf(entries)).toEqual([
        "pi.user",
        "pi.system",
        "pi.assistant(c0)",
        "pi.tool-result(c0)",
        "pi.assistant(c1)",
        "pi.tool-result(c1)",
        pruneEntryKind,
        "pi.assistant",
      ]);
      // No second model request for the round: the tools phase reran, not the request.
      expect(requests).toHaveLength(3);
      expect(shownReadBacks(requests[2]!)).toEqual(["c1"]);
      expect(
        second.reports.filter(({ kind }) => kind === "extension_error"),
      ).toEqual([]);
    } finally {
      await second.harness.close(context);
    }
  });

  test("stopped after the write was admitted, before the boundary placed it: recovery reruns the hook, deduplication returns the same submission, one entry", async () => {
    const { models, model, requests } = responses();
    // afterWrite runs only after a write: its first invocation is round c1's.
    const stall = stallOn(1);
    const first = await openProbeHarness(
      await openNodeSqliteStorage(file),
      models,
      { hook: { afterWrite: stall.step } },
    );
    const root = await first.harness.root(context, { agent: { model } });
    const input = await root.submit({ type: "input", content: "go" }, context);
    await stall.reached;
    expect(first.submissions).toHaveLength(1);
    const queued: SubmissionId = first.submissions[0]!;
    const assistant = first.calls[1]!.assistant;
    expect((await submissionFor(first.harness, root.id, assistant))?.id).toBe(
      queued,
    );
    expect(kindsOf(await allEntries(root)).includes(pruneEntryKind)).toBe(
      false,
    );
    await first.harness.close(context);

    const second = await openProbeHarness(
      await openNodeSqliteStorage(file),
      models,
    );
    try {
      const recovered = await second.harness.submission(input.id, context);
      expect((await recovered!.wait(context)).status).toBe("done");
      expect(second.calls).toEqual([first.calls[1]]);
      expect(second.submissions).toEqual([queued]);
      const resumed = await second.harness.conversation(root.id, context);
      const entries = await allEntries(resumed!);
      expect(
        entries.filter(({ kind }) => kind === pruneEntryKind),
      ).toHaveLength(1);
      expect(resultEntry(entries, "c1")).toBeDefined();
      expect(requests).toHaveLength(3);
      expect(shownReadBacks(requests[2]!)).toEqual(["c1"]);
    } finally {
      await second.harness.close(context);
    }
  });

  test("a new Harness that runs before its host closure is bound: the rerun hook fails, is reported, is not retried, and the model sees an extra read-back", async () => {
    const { models, model, requests } = responses();
    const stall = stallOn(2);
    const first = await openProbeHarness(
      await openNodeSqliteStorage(file),
      models,
      { hook: { beforeDecide: stall.step } },
    );
    const root = await first.harness.root(context, { agent: { model } });
    const input = await root.submit({ type: "input", content: "go" }, context);
    await stall.reached;
    await first.harness.close(context);

    const second = await openProbeHarness(
      await openNodeSqliteStorage(file),
      models,
      { unbound: true },
    );
    try {
      const recovered = await second.harness.submission(input.id, context);
      expect((await recovered!.wait(context)).status).toBe("done");
      expect(second.calls).toHaveLength(1);
      expect(
        second.reports.map(({ kind, error }) => [
          kind,
          error instanceof Error ? error.message : error,
        ]),
      ).toEqual([["extension_error", "Host is not bound."]]);
      expect(shownReadBacks(requests[2]!)).toEqual(["c0", "c1"]);
    } finally {
      await second.harness.close(context);
    }
  });
});

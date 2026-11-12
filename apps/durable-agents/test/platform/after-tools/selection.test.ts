/**
 * Can `GenerationHooks.afterTools` choose which net read-backs the model
 * keeps from the round's actual outcomes, and write that choice as a stored
 * context edit through a host closure?
 *
 * Every change result renders its read-back in `output`; after each round
 * the hook derives the latest complete net view from the effective
 * `ContextView.messages` and replaces every other read-back with the result
 * less its read-back block. Obligations 1–4 and 6–9 of
 * `probes-after-tools.md`; restart (5) is in `restart.test.ts`.
 */
import { awaitWithContext } from "@earendil-works/chord/context";
import {
  CompactionTask,
  type Conversation,
  defineExtension,
  type EntryRecord,
  type SubmissionId,
  type Extension,
  hook,
  MemoryStorage,
} from "@earendil-works/pi-durable";
import { describe, expect, test, vi } from "vitest";

import {
  allEntries,
  calls,
  context,
  fauxAssistantMessage,
  kindsOf,
  recordingModel,
  resultEntry,
  textOf,
} from "../support";
import {
  admitPruning,
  changeTool,
  failed,
  freshness,
  latestVisibleNetView,
  noViewRefusal,
  ok,
  openProbeHarness,
  pruneEntryKind,
  pruneReadBacksExtension,
  readTool,
  renderView,
  resultTexts,
  shownReadBacks,
  unchanged,
  waitingChangeTool,
} from "./support";

import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";

type ScenarioOptions = Parameters<typeof openProbeHarness>[2];

/** One input, answered by `responses`, over memory. */
const scenario = async (
  responses: readonly FauxResponseStep[],
  options: ScenarioOptions = {},
) => {
  const { models, model, requests } = recordingModel(responses);
  const probe = await openProbeHarness(new MemoryStorage(), models, options);
  const root = await probe.harness.root(context, { agent: { model } });
  return { ...probe, root, requests };
};

const go = async (root: Conversation, content = "go") => {
  const submission = await root.submit({ type: "input", content }, context);
  return (await submission.wait(context)).status;
};

/** The raw result text of call `toolCallId`, as committed. */
const rawText = (entries: readonly EntryRecord[], toolCallId: string) =>
  textOf(resultEntry(entries, toolCallId)?.model?.[0]);

const readBackOf = (revision: string) => renderView("read-back", revision);

/** A round `c0` that changes the net to R1 and shows its read-back. */
const earlierRound = calls(["change", "c0", ok("R1", "R0")]);

describe("1: outcome-aware selection after a round", () => {
  test("c1 ok + c2 ok: only c2 keeps its read-back; c1 and the earlier round's c0 are pruned; raw results unchanged", async () => {
    const probe = await scenario([
      earlierRound,
      calls(["change", "c1", ok("R2", "R1")], ["change", "c2", ok("R3", "R2")]),
      fauxAssistantMessage("done"),
    ]);
    try {
      expect(await go(probe.root)).toBe("done");
      const entries = await allEntries(probe.root);
      // The first round had nothing to prune: no write.
      expect(kindsOf(entries)).toEqual([
        "pi.user",
        "pi.system",
        "pi.assistant(c0)",
        "pi.tool-result(c0)",
        "pi.assistant(c1,c2)",
        "pi.tool-result(c1)",
        "pi.tool-result(c2)",
        pruneEntryKind,
        "pi.assistant",
      ]);
      expect(shownReadBacks(probe.requests[1]!)).toEqual(["c0"]);
      expect(shownReadBacks(probe.requests[2]!)).toEqual(["c2"]);
      expect(resultTexts(probe.requests[2]!)).toEqual({
        c0: "Applied.",
        c1: "Applied.",
        c2: `Applied.\n${readBackOf("R3")}`,
      });
      expect(freshness(probe.requests[2]!)).toEqual({ revision: "R3" });
      for (const [id, revision] of [
        ["c0", "R1"],
        ["c1", "R2"],
        ["c2", "R3"],
      ] as const)
        expect(rawText(entries, id)).toBe(`Applied.\n${readBackOf(revision)}`);
    } finally {
      await probe.harness.close(context);
    }
  });

  test("c1 ok + c2 failed: c1 keeps its read-back, c0 is pruned", async () => {
    const probe = await scenario([
      earlierRound,
      calls(["change", "c1", ok("R2", "R1")], ["change", "c2", failed("R2")]),
      fauxAssistantMessage("done"),
    ]);
    try {
      expect(await go(probe.root)).toBe("done");
      const request = probe.requests[2]!;
      expect(shownReadBacks(request)).toEqual(["c1"]);
      expect(resultTexts(request).c0).toBe("Applied.");
      expect(
        request.find((m) => m.role === "toolResult" && m.toolCallId === "c2"),
      ).toMatchObject({ isError: true });
      expect(freshness(request)).toEqual({ revision: "R2" });
    } finally {
      await probe.harness.close(context);
    }
  });

  test("c1 ok + c2 unchanged (no after): c1 keeps its read-back, c0 is pruned", async () => {
    const probe = await scenario([
      earlierRound,
      calls(
        ["change", "c1", ok("R2", "R1")],
        ["change", "c2", unchanged("R2")],
      ),
      fauxAssistantMessage("done"),
    ]);
    try {
      expect(await go(probe.root)).toBe("done");
      const request = probe.requests[2]!;
      expect(shownReadBacks(request)).toEqual(["c1"]);
      expect(resultTexts(request)).toMatchObject({
        c0: "Applied.",
        c2: "Nothing changed.",
      });
      expect(freshness(request)).toEqual({ revision: "R2" });
    } finally {
      await probe.harness.close(context);
    }
  });

  test("a read after a change in the same round: the read is the view; c1 and c0 lose their read-backs", async () => {
    const probe = await scenario([
      earlierRound,
      calls(
        ["change", "c1", ok("R2", "R1")],
        ["read", "r2", { revision: "R2" }],
      ),
      fauxAssistantMessage("done"),
    ]);
    try {
      expect(await go(probe.root)).toBe("done");
      const request = probe.requests[2]!;
      expect(shownReadBacks(request)).toEqual([]);
      expect(latestVisibleNetView(request)).toMatchObject({
        toolCallId: "r2",
        kind: "view",
      });
      expect(resultTexts(request)).toMatchObject({
        c0: "Applied.",
        c1: "Applied.",
        r2: renderView("view", "R2"),
      });
      expect(freshness(request)).toEqual({ revision: "R2" });
    } finally {
      await probe.harness.close(context);
    }
  });

  test("a round whose only change failed prunes nothing: the earlier read-back stays the view", async () => {
    const probe = await scenario([
      earlierRound,
      calls(["change", "c1", failed("R1")]),
      fauxAssistantMessage("done"),
    ]);
    try {
      expect(await go(probe.root)).toBe("done");
      expect(shownReadBacks(probe.requests[2]!)).toEqual(["c0"]);
      expect(
        kindsOf(await allEntries(probe.root)).includes(pruneEntryKind),
      ).toBe(false);
    } finally {
      await probe.harness.close(context);
    }
  });
});

describe("2: placement", () => {
  test("the pruning write lands after the round's results and before the next request, which equals the committed effective context; no beforeRequest hook", async () => {
    const probe = await scenario([
      earlierRound,
      calls(["change", "c1", ok("R2", "R1")], ["change", "c2", ok("R3", "R2")]),
      fauxAssistantMessage("done"),
    ]);
    try {
      expect(await go(probe.root)).toBe("done");
      const extension = pruneReadBacksExtension({ host: probe.host });
      expect(
        extension.hooks?.flatMap((registration) =>
          Object.keys(registration.handlers),
        ),
      ).toEqual(["afterTools"]);
      const entries = await allEntries(probe.root);
      const prune = entries.find(({ kind }) => kind === pruneEntryKind)!;
      const resultIds = ["c1", "c2"].map((id) => resultEntry(entries, id)!.id);
      const nextAnswer = entries.at(-1)!;
      expect(resultIds.every((id) => id < prune.id)).toBe(true);
      expect(prune.id < nextAnswer.id).toBe(true);
      // The hook got exactly the round's result entries, in call order.
      expect(probe.calls.at(-1)?.results).toEqual(resultIds);
      // The request the model got is the committed context as of the write, exactly.
      const committed = await probe.root.context(context, { at: prune.id });
      expect(probe.requests[2]).toEqual(committed.messages);
      expect(probe.submissions).toHaveLength(1);
    } finally {
      await probe.harness.close(context);
    }
  });
});

describe("3: fail-safe", () => {
  test("the hook throws: reported, the run goes on, and the model sees every read-back, an extra one rather than none", async () => {
    const probe = await scenario(
      [
        earlierRound,
        calls(["change", "c1", ok("R2", "R1")], ["change", "c2", failed("R2")]),
        fauxAssistantMessage("done"),
      ],
      {
        hook: {
          beforeDecide: async () => {
            throw new Error("observer failed");
          },
        },
      },
    );
    try {
      expect(await go(probe.root)).toBe("done");
      expect(shownReadBacks(probe.requests[2]!)).toEqual(["c0", "c1"]);
      expect(freshness(probe.requests[2]!)).toEqual({ revision: "R2" });
      expect(
        probe.reports.filter(({ kind }) => kind === "extension_error"),
      ).toHaveLength(2);
      expect(
        kindsOf(await allEntries(probe.root)).includes(pruneEntryKind),
      ).toBe(false);
    } finally {
      await probe.harness.close(context);
    }
  });

  test("an unbound host closure: the same, reported and nothing pruned", async () => {
    const probe = await scenario(
      [
        earlierRound,
        calls(["change", "c1", ok("R2", "R1")]),
        fauxAssistantMessage("done"),
      ],
      { unbound: true },
    );
    try {
      expect(await go(probe.root)).toBe("done");
      expect(shownReadBacks(probe.requests[2]!)).toEqual(["c0", "c1"]);
      expect(
        probe.reports.map(({ kind, error }) => [
          kind,
          error instanceof Error ? error.message : error,
        ]),
      ).toContainEqual(["extension_error", "Host is not bound."]);
    } finally {
      await probe.harness.close(context);
    }
  });

  test("the hook throws after its write was admitted: the write still lands, and it is consistent, since it was decided from settled results", async () => {
    const probe = await scenario(
      [
        earlierRound,
        calls(["change", "c1", ok("R2", "R1")]),
        fauxAssistantMessage("done"),
      ],
      {
        hook: {
          afterWrite: async () => {
            throw new Error("after write");
          },
        },
      },
    );
    try {
      expect(await go(probe.root)).toBe("done");
      expect(shownReadBacks(probe.requests[2]!)).toEqual(["c1"]);
      expect(probe.reports).toHaveLength(1);
    } finally {
      await probe.harness.close(context);
    }
  });
});

describe("4: deduplication", () => {
  test("re-running the decision for the same round under its request ID returns the same submission and writes once", async () => {
    let again: SubmissionId | undefined;
    const probe = await scenario(
      [
        earlierRound,
        calls(["change", "c1", ok("R2", "R1")]),
        fauxAssistantMessage("done"),
      ],
      {
        hook: {
          // A duplicate invocation of the same round's decision, before the boundary places the first write.
          afterWrite: async ({ assistant }, hookContext) => {
            const conversation = await probe.harness.conversation(
              probe.root.id,
              hookContext,
            );
            again = await admitPruning(conversation!, assistant, hookContext);
          },
        },
      },
    );
    try {
      expect(await go(probe.root)).toBe("done");
      expect(again).toBeDefined();
      expect(probe.submissions).toEqual([again]);
      expect(
        kindsOf(await allEntries(probe.root)).filter(
          (kind) => kind === pruneEntryKind,
        ),
      ).toHaveLength(1);
      expect(shownReadBacks(probe.requests[2]!)).toEqual(["c1"]);
    } finally {
      await probe.harness.close(context);
    }
  });
});

describe("6: cancellation", () => {
  test("abort while a browser change waits: afterTools does not run; every read-back stays; the next round prunes", async () => {
    const waiting = waitingChangeTool();
    const probe = await scenario(
      [
        earlierRound,
        calls(
          ["change", "c1", ok("R2", "R1")],
          ["waitingChange", "w", { revision: "R3" }],
        ),
        // The next input's run.
        calls(["change", "c3", ok("R3", "R2")]),
        fauxAssistantMessage("done"),
      ],
      { tools: [changeTool(), readTool, waiting.tool] },
    );
    try {
      const input = await probe.root.submit(
        { type: "input", content: "go" },
        context,
      );
      await waiting.started;
      await vi.waitFor(async () =>
        expect(resultEntry(await allEntries(probe.root), "c1")).toBeDefined(),
      );
      await probe.root.abort(context);
      expect((await input.wait(context)).status).toBe("unanswered");
      // Only the first round's hook ran.
      expect(probe.calls).toHaveLength(1);
      const aborted = await probe.root.context(context);
      expect(shownReadBacks(aborted.messages)).toEqual(["c0", "c1"]);
      expect(
        aborted.messages.find(
          (m) => m.role === "toolResult" && m.toolCallId === "w",
        ),
      ).toMatchObject({ isError: true });
      expect(freshness(aborted.messages)).toEqual({ revision: "R2" });

      expect(await go(probe.root, "next")).toBe("done");
      // The next run's first request: both read-backs, never none.
      expect(shownReadBacks(probe.requests[2]!)).toEqual(["c0", "c1"]);
      // Its round's hook prunes from the whole effective context.
      expect(shownReadBacks(probe.requests[3]!)).toEqual(["c3"]);
    } finally {
      await probe.harness.close(context);
    }
  });

  test("abort while the hook runs, after its write was admitted: the queued write stays and lands at the next boundary", async () => {
    let written: () => void = () => undefined;
    const admitted = new Promise<void>((resolve) => {
      written = resolve;
    });
    const probe = await scenario(
      [
        earlierRound,
        calls(["change", "c1", ok("R2", "R1")]),
        fauxAssistantMessage("after abort"),
      ],
      {
        hook: {
          afterWrite: async (_call, hookContext) => {
            written();
            await awaitWithContext(new Promise(() => undefined), hookContext);
          },
        },
      },
    );
    try {
      const input = await probe.root.submit(
        { type: "input", content: "go" },
        context,
      );
      await admitted;
      await probe.root.abort(context);
      expect((await input.wait(context)).status).toBe("unanswered");
      expect(
        kindsOf(await allEntries(probe.root)).includes(pruneEntryKind),
      ).toBe(false);
      expect(await go(probe.root, "next")).toBe("done");
      const kinds = kindsOf(await allEntries(probe.root));
      expect(kinds.slice(-3)).toEqual([
        pruneEntryKind,
        "pi.user",
        "pi.assistant",
      ]);
      expect(shownReadBacks(probe.requests[2]!)).toEqual(["c1"]);
    } finally {
      await probe.harness.close(context);
    }
  });
});

describe("7: output limits", () => {
  const big = 60_000;

  test("a read-back past the default bound is cut without an error; the model gets the head and a warning; it does not count as a view", async () => {
    const probe = await scenario([
      calls(["change", "c1", ok("R1", "R0", big)]),
      fauxAssistantMessage("done"),
    ]);
    try {
      expect(await go(probe.root)).toBe("done");
      const result = probe.requests[1]!.find(
        (m) => m.role === "toolResult" && m.toolCallId === "c1",
      );
      const text = textOf(result);
      expect(result).toMatchObject({ isError: false });
      expect(text).not.toContain("END OF NET");
      expect(text).toContain("</harness>");
      const warning = text.slice(text.indexOf("<harness>"));
      expect(warning).toMatch(
        /^<harness>\n\[warn\] Output truncated to its beginning: \d+ lines, \d+ bytes dropped\n<\/harness>$/u,
      );
      // Head retention keeps whole lines within 50 KiB: the read-back's line is dropped entirely.
      const rendered = `Applied.\n${renderView("read-back", "R1", big)}`;
      const kept = text.slice(0, text.indexOf("<harness>"));
      expect(kept).toBe("Applied.\n");
      expect(Buffer.byteLength(rendered)).toBeGreaterThan(50 * 1024);
      expect(warning).toContain(
        `1 lines, ${Buffer.byteLength(rendered) - Buffer.byteLength(kept)} bytes dropped`,
      );
      // The entry says so in data; details keep the full read-back.
      const entry = resultEntry(await allEntries(probe.root), "c1")!;
      expect(entry.data).toMatchObject({
        diagnostics: [{ severity: "warn", code: "truncated" }],
      });
      const message = entry.model?.[0];
      expect(
        message?.role === "toolResult" &&
          (message.details as { metadata: { readBack: { last: string } } })
            .metadata.readBack.last,
      ).toBe("END OF NET");
      expect(freshness(probe.requests[1]!)).toEqual({ refusal: noViewRefusal });
    } finally {
      await probe.harness.close(context);
    }
  });

  test("a cut read-back does not supersede: the earlier complete read-back stays the view", async () => {
    const probe = await scenario([
      earlierRound,
      calls(["change", "c1", ok("R2", "R1", big)]),
      fauxAssistantMessage("done"),
    ]);
    try {
      expect(await go(probe.root)).toBe("done");
      expect(shownReadBacks(probe.requests[2]!)).toEqual(["c0"]);
      // Stale but present: a change from it would be refused by the browser's revision check, not run blind.
      expect(freshness(probe.requests[2]!)).toEqual({ revision: "R1" });
      expect(
        kindsOf(await allEntries(probe.root)).includes(pruneEntryKind),
      ).toBe(false);
    } finally {
      await probe.harness.close(context);
    }
  });

  test("outputLimits on the tool raises its bound: the whole read-back arrives and supersedes", async () => {
    const probe = await scenario(
      [
        earlierRound,
        calls(["change", "c1", ok("R2", "R1", big)]),
        fauxAssistantMessage("done"),
      ],
      {
        tools: [
          changeTool({ outputLimits: { maxBytes: 256 * 1024 } }),
          readTool,
        ],
      },
    );
    try {
      expect(await go(probe.root)).toBe("done");
      expect(shownReadBacks(probe.requests[2]!)).toEqual(["c1"]);
      expect(freshness(probe.requests[2]!)).toEqual({ revision: "R2" });
      expect(
        textOf(
          probe.requests[2]!.find(
            (m) => m.role === "toolResult" && m.toolCallId === "c1",
          ),
        ),
      ).toContain("END OF NET");
    } finally {
      await probe.harness.close(context);
    }
  });
});

const summaryHook: Extension = defineExtension({
  name: "probe.summary",
  hooks: [
    hook(CompactionTask, {
      beforeCompact: () => ({ summary: "We talked about the net." }),
    }),
  ],
});

describe("8: later edits remove the view that replaced a read-back", () => {
  const twoRounds = () =>
    scenario(
      [
        calls(["change", "c1", ok("R1", "R0")]),
        calls(["read", "r2", { revision: "R2" }]),
        fauxAssistantMessage("done"),
      ],
      {
        extraExtensions: [summaryHook],
        settings: { compaction: { keepRecentTokens: 1 } },
      },
    );

  test("an edit that omits the read: c1's read-back is not restored, and freshness refuses", async () => {
    const probe = await twoRounds();
    try {
      expect(await go(probe.root)).toBe("done");
      expect(freshness(probe.requests[2]!)).toEqual({ revision: "R2" });
      expect(resultTexts(probe.requests[2]!).c1).toBe("Applied.");
      const read = resultEntry(await allEntries(probe.root), "r2")!;
      await probe.root.submit(
        {
          type: "write",
          entry: {
            kind: "probe.omit",
            edits: [{ target: read.id, action: "omit" }],
          },
        },
        context,
      );
      const view = await probe.root.context(context);
      // Pi synthesizes an error result for the omitted call, which shows no net.
      expect(resultTexts(view.messages)).toEqual({
        c1: "Applied.",
        r2: "Tool result unavailable: history ends before this call completed.",
      });
      expect(freshness(view.messages)).toEqual({ refusal: noViewRefusal });
      // The raw result still has it; only a new edit could bring it back.
      expect(rawText(view.entries, "c1")).toContain("<net-read-back");
    } finally {
      await probe.harness.close(context);
    }
  });

  test("a compaction that cuts the read away: the summary has no view, and freshness refuses", async () => {
    const probe = await twoRounds();
    try {
      expect(await go(probe.root)).toBe("done");
      const task = await probe.root.compact(undefined, context);
      const { state } = await probe.harness.waitForTask(task, context);
      expect(state.outcome.status).toBe("completed");
      const view = await probe.root.context(context);
      expect(view.head?.kind).toBe("pi.compaction");
      expect(resultTexts(view.messages)).toEqual({});
      expect(freshness(view.messages)).toEqual({ refusal: noViewRefusal });
    } finally {
      await probe.harness.close(context);
    }
  });
});

describe("9: a sequential round", () => {
  test("with one sequential tool, afterTools runs once after every call, with the results in call order, and prunes as in a parallel round", async () => {
    const probe = await scenario(
      [
        earlierRound,
        calls(
          ["change", "c1", ok("R2", "R1")],
          ["read", "r2", { revision: "R2" }],
          ["change", "c3", ok("R3", "R2")],
          ["change", "c4", failed("R3")],
        ),
        fauxAssistantMessage("done"),
      ],
      {
        tools: [changeTool({ executionMode: "sequential" }), readTool],
      },
    );
    try {
      expect(await go(probe.root)).toBe("done");
      const entries = await allEntries(probe.root);
      expect(probe.calls).toHaveLength(2);
      expect(probe.calls[1]!.results).toEqual(
        ["c1", "r2", "c3", "c4"].map((id) => resultEntry(entries, id)!.id),
      );
      expect(shownReadBacks(probe.requests[2]!)).toEqual(["c3"]);
      expect(freshness(probe.requests[2]!)).toEqual({ revision: "R3" });
    } finally {
      await probe.harness.close(context);
    }
  });

  test("control, parallel: results completing out of call order still reach afterTools in call order", async () => {
    const waiting = waitingChangeTool();
    const probe = await scenario(
      [
        calls(
          ["waitingChange", "w1", { revision: "R1" }],
          ["change", "c2", ok("R2", "R1")],
        ),
        fauxAssistantMessage("done"),
      ],
      { tools: [changeTool(), readTool, waiting.tool] },
    );
    try {
      const input = await probe.root.submit(
        { type: "input", content: "go" },
        context,
      );
      await waiting.started;
      await vi.waitFor(async () =>
        expect(resultEntry(await allEntries(probe.root), "c2")).toBeDefined(),
      );
      waiting.release();
      expect((await input.wait(context)).status).toBe("done");
      const entries = await allEntries(probe.root);
      const w1 = resultEntry(entries, "w1")!.id;
      const c2 = resultEntry(entries, "c2")!.id;
      // Committed c2 first, handed over in call order.
      expect(c2 < w1).toBe(true);
      expect(probe.calls[0]!.results).toEqual([w1, c2]);
      // Pi orders the messages by call too: c2's read-back is the latest view, w1's is pruned.
      expect(shownReadBacks(probe.requests[1]!)).toEqual(["c2"]);
      expect(resultTexts(probe.requests[1]!).w1).toBe("Applied.");
    } finally {
      await probe.harness.close(context);
    }
  });
});

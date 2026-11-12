import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type ContextEdit,
  type ContextView,
  type Conversation,
  createRegistry,
  defineExtension,
  defineTool,
  type EntryId,
  type EntryRecord,
  Harness,
  type JsonObject,
  MemoryStorage,
  type ToolExecutionResult,
} from "@earendil-works/pi-durable";
import { num, obj, str } from "@earendil-works/pi-schema";
import { describe, expect, test } from "vitest";

import {
  fauxAssistantMessage,
  fauxToolCall,
  scriptedModel,
} from "../../test/scripted-model";
import {
  handEditEntryKind,
  netViewSectionKey,
  parseNetResultText,
  pruneEdits,
  renderBrowserResult,
  renderHandEditNote,
  renderNetChange,
  renderNetRead,
  renderNetViewSection,
  renderPlainResult,
  visibleNetView,
} from "./visible-net-view";

import type {
  Message,
  ToolResultMessage,
  UserMessage,
} from "@earendil-works/pi-ai";

const context = BACKGROUND_CONTEXT;

/** A net reader and a canonical change: `mayShowNet` holds for both. */
const readTool = "readNetStructure";
const changeTool = "setNetTitle";

const structureAt = (revision: string, padding = 0) => ({
  revision,
  places: [{ id: "place-dryer", name: "Dryer" }],
  ...(padding === 0 ? {} : { padding: "x".repeat(padding) }),
});

// ─── Effective messages, built by hand ───────────────────────────────────────

const toolResult = (
  toolName: string,
  text: string,
  options: { readonly isError?: boolean; readonly extra?: string[] } = {},
): ToolResultMessage => ({
  role: "toolResult",
  toolCallId: `call-${toolName}-${text.length}`,
  toolName,
  content: [
    { type: "text", text },
    ...(options.extra ?? []).map((extra) => ({
      type: "text" as const,
      text: extra,
    })),
  ],
  isError: options.isError ?? false,
  timestamp: 0,
});

const read = (revision: string) =>
  toolResult(readTool, renderNetRead(structureAt(revision), revision));

const change = (revision: string) =>
  toolResult(
    changeTool,
    renderNetChange("Title set.", structureAt(revision), revision),
  );

const user = (text: string): UserMessage => ({
  role: "user",
  content: text,
  timestamp: 0,
});

const section = (text: string | null): Message => ({
  role: "system",
  content: "",
  sections: { [netViewSectionKey]: text },
  timestamp: 0,
});

/** One effective-context item: a message and the kind of the entry that contributed it. */
type Item = { readonly kind: string; readonly message: Message };

const tool = (message: ToolResultMessage): Item => ({
  kind: "pi.tool-result",
  message,
});
const note = (revision: string): Item => ({
  kind: handEditEntryKind,
  message: user(renderHandEditNote(revision)),
});
const said = (text: string): Item => ({ kind: "pi.user", message: user(text) });
const baseline = (text: string | null): Item => ({
  kind: "pi.system",
  message: section(text),
});

/** A context view whose entries each contribute one message, in order. */
const viewOf = (...items: Item[]): ContextView => {
  const entries = items.map(
    ({ kind, message }, index): EntryRecord =>
      ({
        id: (index + 1) as EntryId,
        conversationId: "root",
        kind,
        model: [message],
      }) as unknown as EntryRecord,
  );
  return {
    head: undefined,
    entries,
    contributions: items.map(({ message }) => [message]),
    messages: items.map(({ message }) => message),
  };
};

const stateOf = (view: ContextView) => {
  const visible = visibleNetView(view);
  switch (visible.state) {
    case "none":
      return "none";
    case "stale":
      return `stale ${visible.seen}→${visible.edited}`;
    case "current":
      return `current ${visible.kind} ${visible.revision}`;
  }
};

const truncation =
  "<harness>\n[warn] Output truncated to its beginning: 3 lines, 9000 bytes dropped\n</harness>";

describe("the model-facing renderings", () => {
  test("a read with a revision, a change with its read-back, and everything else bare", () => {
    expect(
      renderBrowserResult(
        readTool,
        { places: [] },
        {
          documentRevision: { before: "R1" },
        },
      ),
    ).toBe('{"output":{"places":[]},"netRevision":"R1"}');
    expect(
      renderBrowserResult(changeTool, "Title set.", {
        documentRevision: { before: "R1", after: "R2" },
        readBack: { places: [] },
      }),
    ).toBe(
      '{"output":"Title set.","netAfterChanges":{"places":[]},"netRevision":"R2"}',
    );
    // A read without a revision, a change without a read-back, and a tool that never shows the net.
    expect(renderBrowserResult(readTool, { places: [] }, null)).toBe(
      '{"places":[]}',
    );
    expect(
      renderBrowserResult(changeTool, "Unchanged.", {
        documentRevision: { before: "R1" },
      }),
    ).toBe('"Unchanged."');
    expect(
      renderBrowserResult("readNetOutlineOfSomethingElse", "123", {
        documentRevision: { before: "R1" },
      }),
    ).toBe('"123"');
  });

  test("parses only an object with an output and a string revision", () => {
    expect(parseNetResultText(renderNetRead("x", "R1"))).toEqual({
      output: "x",
      netRevision: "R1",
    });
    expect(parseNetResultText(renderNetChange("x", { a: 1 }, "R2"))).toEqual({
      output: "x",
      netAfterChanges: { a: 1 },
      netRevision: "R2",
    });
    expect(parseNetResultText(renderPlainResult({ x: 1 }))).toBeUndefined();
    expect(parseNetResultText('{"netRevision":"R1"}')).toBeUndefined();
    expect(parseNetResultText('{"output":1,"netRevision":2}')).toBeUndefined();
    expect(parseNetResultText('{"output":1,"netRev')).toBeUndefined();
  });
});

describe("visibleNetView: what counts as a view", () => {
  test("starts at none", () => {
    expect(stateOf(viewOf())).toBe("none");
  });

  test("a complete read and a complete read-back are views; the latest wins", () => {
    expect(stateOf(viewOf(tool(read("R1"))))).toBe("current read R1");
    expect(stateOf(viewOf(tool(read("R1")), tool(change("R2"))))).toBe(
      "current read-back R2",
    );
    const latest = change("R2");
    const visible = visibleNetView(viewOf(tool(read("R1")), tool(latest)));
    expect(visible).toEqual({
      state: "current",
      revision: "R2",
      kind: "read-back",
      body: JSON.stringify(structureAt("R2")),
      message: latest,
    });
  });

  test("a read without a revision, a pruned change and a change without its read-back are not views", () => {
    expect(
      stateOf(
        viewOf(
          tool(toolResult(readTool, renderPlainResult(structureAt("R1")))),
          tool(toolResult(changeTool, renderPlainResult("Title set."))),
          tool(toolResult(changeTool, renderNetRead("Title set.", "R3"))),
        ),
      ),
    ).toBe("none");
  });

  test("an error result is not a view, even with net content and details naming a revision", () => {
    const failed: ToolResultMessage = {
      ...change("R2"),
      isError: true,
      details: {
        brunchBrowserResult: true,
        output: "Title set.",
        metadata: {
          documentRevision: { before: "R1", after: "R2" },
          readBack: structureAt("R2"),
        },
      },
    };
    expect(stateOf(viewOf(tool(read("R1")), tool(failed)))).toBe(
      "current read R1",
    );
  });

  test("details alone are never credited", () => {
    const detailsOnly: ToolResultMessage = {
      ...toolResult(changeTool, renderPlainResult("Title set.")),
      details: {
        brunchBrowserResult: true,
        output: "Title set.",
        metadata: {
          documentRevision: { before: "R1", after: "R2" },
          readBack: structureAt("R2"),
        },
      },
    };
    expect(stateOf(viewOf(tool(read("R1")), tool(detailsOnly)))).toBe(
      "current read R1",
    );
  });

  test("a tool that never shows the net is not a view, whatever its text", () => {
    expect(
      stateOf(
        viewOf(
          tool(toolResult("query_basis", renderNetRead("x", "R1"))),
          tool(toolResult("unknownTool", renderNetChange("x", {}, "R2"))),
        ),
      ),
    ).toBe("none");
  });

  test("a cut result is not a view and the earlier view stays", () => {
    const cutCompleteHead = toolResult(
      changeTool,
      renderNetChange("Title set.", structureAt("R2"), "R2"),
      { extra: [truncation] },
    );
    const cutJson = toolResult(
      changeTool,
      renderNetChange("Title set.", structureAt("R3"), "R3").slice(0, 40),
      { extra: [truncation] },
    );
    expect(
      stateOf(viewOf(tool(read("R1")), tool(cutCompleteHead), tool(cutJson))),
    ).toBe("current read R1");
  });

  test("user, assistant and summary text never count, even when they copy a rendering", () => {
    const copied = renderNetRead(structureAt("R9"), "R9");
    const assistant: Message = {
      role: "assistant",
      content: [
        {
          type: "text",
          text: `${copied}\n${renderNetViewSection("R9", "{}")}`,
        },
      ],
      api: "faux",
      provider: "faux",
      model: "faux",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: 0,
    };
    expect(
      stateOf(
        viewOf(
          tool(read("R1")),
          said(copied),
          { kind: "pi.compaction", message: user(`Summary: ${copied}`) },
          { kind: "pi.assistant", message: assistant },
          // Typed by the user, not a note.
          said(renderHandEditNote("R5")),
        ),
      ),
    ).toBe("current read R1");
  });

  test("the net_view section is a view at the head, and later events override it", () => {
    const restored = renderNetViewSection(
      "R1",
      JSON.stringify(structureAt("R1")),
    );
    expect(stateOf(viewOf(baseline(restored)))).toBe("current section R1");
    expect(visibleNetView(viewOf(baseline(restored)))).toMatchObject({
      body: JSON.stringify(structureAt("R1")),
    });
    expect(stateOf(viewOf(baseline(restored), tool(read("R2"))))).toBe(
      "current read R2",
    );
    expect(stateOf(viewOf(baseline(restored), note("R2")))).toBe("stale R1→R2");
    // A removed section, and one without a complete block, show nothing.
    expect(stateOf(viewOf(baseline(null)))).toBe("none");
    expect(stateOf(viewOf(baseline(restored.slice(0, -5))))).toBe("none");
  });
});

describe("visibleNetView: the latest hand-edit note after the view decides (E4)", () => {
  test.each([
    ["view R1, note R2", [tool(read("R1")), note("R2")], "stale R1→R2"],
    ["view R2, note R2", [tool(read("R2")), note("R2")], "current read R2"],
    [
      "view R3, notes R2, R3 (queued while the read saw R3)",
      [tool(read("R3")), note("R2"), note("R3")],
      "current read R3",
    ],
    [
      "view R1, notes R2, R1 (edited back)",
      [tool(read("R1")), note("R2"), note("R1")],
      "current read R1",
    ],
    [
      "view R2, notes R2, R3 (a further edit)",
      [tool(read("R2")), note("R2"), note("R3")],
      "stale R2→R3",
    ],
    [
      "recurrence: R2 again under a new episode, two note entries",
      [
        tool(read("R1")),
        note("R2"),
        tool(read("R2")),
        tool(change("R3")),
        note("R2"),
      ],
      "stale R3→R2",
    ],
    ["a note before any view", [note("R2")], "none"],
    [
      "a note before any view, then a view",
      [note("R2"), tool(read("R1"))],
      "current read R1",
    ],
    [
      "a later read clears",
      [tool(read("R1")), note("R2"), tool(read("R2"))],
      "current read R2",
    ],
  ])("%s", (_name, items, expected) => {
    expect(stateOf(viewOf(...items))).toBe(expected);
  });

  test("a stale result names the latest view's message", () => {
    const latest = change("R2");
    expect(
      visibleNetView(viewOf(tool(read("R1")), tool(latest), note("R3"))),
    ).toEqual({ state: "stale", seen: "R2", edited: "R3", message: latest });
  });
});

describe("pruneEdits over hand-built context", () => {
  const edited = (view: ContextView) =>
    pruneEdits(view).map((edit) => ({
      target: edit.target,
      action: edit.action,
      text:
        edit.action === "replace" && edit.messages[0]?.role === "toolResult"
          ? edit.messages[0].content
          : undefined,
    }));

  test("prunes every complete read-back but the latest view's, to its bare output", () => {
    expect(
      edited(viewOf(tool(change("R1")), tool(read("R1")), tool(change("R2")))),
    ).toEqual([
      {
        target: 1,
        action: "replace",
        text: [{ type: "text", text: '"Title set."' }],
      },
    ]);
  });

  test("is outcome-aware: a failed, unchanged or cut latest sibling keeps the earlier read-back", () => {
    const failed = toolResult(changeTool, "The browser refused the change.", {
      isError: true,
    });
    const unchanged = toolResult(changeTool, renderPlainResult("Unchanged."));
    const cut = toolResult(
      changeTool,
      renderNetChange("Title set.", structureAt("R3"), "R3"),
      { extra: [truncation] },
    );
    expect(
      edited(
        viewOf(
          tool(change("R0")),
          tool(change("R1")),
          tool(failed),
          tool(unchanged),
          tool(cut),
        ),
      ).map(({ target }) => target),
    ).toEqual([1]);
  });

  test("never targets reads, sections or notes, and prunes behind a stale view or a section", () => {
    const restored = renderNetViewSection("R0", "{}");
    expect(
      edited(
        viewOf(
          baseline(restored),
          tool(read("R1")),
          tool(change("R2")),
          note("R3"),
          tool(read("R3")),
        ),
      ).map(({ target }) => target),
    ).toEqual([3]);
    expect(
      edited(viewOf(tool(change("R1")), tool(change("R2")), note("R3"))).map(
        ({ target }) => target,
      ),
    ).toEqual([1]);
  });

  test("prunes nothing without a view", () => {
    expect(
      pruneEdits(
        viewOf(
          tool(toolResult(changeTool, renderPlainResult("x"))),
          note("R1"),
        ),
      ),
    ).toEqual([]);
  });

  test("keeps the message's other fields and parts", () => {
    const withDetails: ToolResultMessage = {
      ...change("R1"),
      content: [
        ...change("R1").content,
        { type: "text", text: "<harness>\n[warn] Slow.\n</harness>" },
      ],
      details: { brunchBrowserResult: true, output: "Title set." },
    };
    const [edit] = pruneEdits(viewOf(tool(withDetails), tool(change("R2"))));
    expect(edit).toEqual({
      target: 1,
      action: "replace",
      messages: [
        {
          ...withDetails,
          content: [
            { type: "text", text: '"Title set."' },
            { type: "text", text: "<harness>\n[warn] Slow.\n</harness>" },
          ],
        },
      ],
    });
  });
});

// ─── Effective context from a real Harness ───────────────────────────────────

/**
 * Stand-ins under the real tool names, returning the rendered result Phase C
 * gives them: `read` at a revision; `change` that succeeds with its
 * read-back, fails, or leaves the net unchanged.
 */
const standInTools = (maxBytes?: number) =>
  defineExtension({
    name: "test.net-tools",
    tools: [
      defineTool({
        name: readTool,
        description: "Reads the net.",
        parameters: obj({ revision: str() }),
        execute: async ({ revision }) => ({
          output: [
            {
              type: "text",
              text: renderNetRead(structureAt(revision), revision),
            },
          ],
        }),
      }),
      defineTool({
        name: changeTool,
        description: "Changes the net.",
        parameters: obj({ outcome: str(), revision: str(), padding: num() }),
        ...(maxBytes === undefined ? {} : { outputLimits: { maxBytes } }),
        execute: async ({
          outcome,
          revision,
          padding,
        }): Promise<ToolExecutionResult> => {
          if (outcome === "fail")
            return {
              isError: true,
              output: [{ type: "text", text: "The browser refused." }],
            };
          return {
            output: [
              {
                type: "text",
                text: renderNetChange(
                  "Title set.",
                  structureAt(revision, padding),
                  revision,
                ),
              },
            ],
          };
        },
      }),
    ],
  });

const ok = (revision: string, padding = 0): JsonObject => ({
  outcome: "ok",
  revision,
  padding,
});
const fail: JsonObject = { outcome: "fail", revision: "", padding: 0 };

type Call = readonly [toolName: string, id: string, args: JsonObject];

/** One round: the model issues `calls` together. */
const round = (...calls: Call[]) =>
  fauxAssistantMessage(
    calls.map(([toolName, id, args]) => fauxToolCall(toolName, args, { id })),
    { stopReason: "toolUse" },
  );

/** Run `rounds` then a reply in a fresh Harness; `use` sees the conversation, open. */
const withConversation = async (
  rounds: ReturnType<typeof round>[],
  use: (root: Conversation) => Promise<void>,
  maxBytes?: number,
) => {
  const { models, model } = scriptedModel([
    ...rounds,
    fauxAssistantMessage("Done."),
  ]);
  const registry = createRegistry();
  registry.install(standInTools(maxBytes));
  const harness = await Harness.open(
    new MemoryStorage(),
    { models, registry },
    context,
  );
  try {
    const root = await harness.root(context, { agent: { model } });
    const submission = await root.submit(
      { type: "input", content: "Change the net." },
      context,
    );
    expect((await submission.wait(context)).status).toBe("done");
    await use(root);
  } finally {
    await harness.close(context);
  }
};

const entryOf = (
  view: ContextView,
  predicate: (entry: EntryRecord) => boolean,
) => {
  const entry = view.entries.find(predicate);
  if (entry === undefined) throw new Error("No such entry.");
  return entry.id;
};

const resultEntryOf = (view: ContextView, toolCallId: string) =>
  entryOf(view, (entry) =>
    (entry.model ?? []).some(
      (message) =>
        message.role === "toolResult" && message.toolCallId === toolCallId,
    ),
  );

const assistantEntryOf = (view: ContextView, toolCallId: string) =>
  entryOf(view, (entry) =>
    (entry.model ?? []).some(
      (message) =>
        message.role === "assistant" &&
        message.content.some(
          (part) => part.type === "toolCall" && part.id === toolCallId,
        ),
    ),
  );

const write = async (
  root: Conversation,
  requestId: string,
  edits: ContextEdit[],
) => {
  await root.submit(
    {
      type: "write",
      requestId,
      entry: { kind: "test.edit", data: {}, edits },
    },
    context,
  );
};

describe("over a real Harness's effective context", () => {
  test("Pi's output bound: a cut read-back is not a view; under a raised bound it is", async () => {
    const rounds = [
      round([readTool, "r1", { revision: "R1" }]),
      round([changeTool, "c2", ok("R2", 60_000)]),
    ];
    await withConversation(rounds, async (root) => {
      const view = await root.context(context);
      expect(stateOf(view)).toBe("current read R1");
      expect(pruneEdits(view)).toEqual([]);
      // Pi's diagnostic, as the hand-built cut results render it.
      const cut = view.messages.find(
        (message) =>
          message.role === "toolResult" && message.toolCallId === "c2",
      );
      const diagnostic =
        cut?.role === "toolResult" ? cut.content.at(-1) : undefined;
      expect(diagnostic?.type === "text" && diagnostic.text).toMatch(
        /^<harness>\n\[warn\] Output truncated/u,
      );
    });
    await withConversation(
      rounds,
      async (root) => {
        expect(stateOf(await root.context(context))).toBe(
          "current read-back R2",
        );
      },
      256 * 1024,
    );
  });

  test("pruning writes apply in order, keep earlier edits, and settle", async () => {
    await withConversation(
      [
        round([changeTool, "c0", ok("R1")]),
        round([changeTool, "c1", ok("R2")], [changeTool, "c2", fail]),
      ],
      async (root) => {
        const before = await root.context(context);
        expect(stateOf(before)).toBe("current read-back R2");
        const edits = pruneEdits(before);
        expect(edits.map(({ target }) => target)).toEqual([
          resultEntryOf(before, "c0"),
        ]);
        await write(root, "prune:1", edits);
        const after = await root.context(context);
        expect(stateOf(after)).toBe("current read-back R2");
        expect(pruneEdits(after)).toEqual([]);
        const c0 = after.messages.find(
          (message) =>
            message.role === "toolResult" && message.toolCallId === "c0",
        );
        expect(c0?.role === "toolResult" && c0.content).toEqual([
          { type: "text", text: '"Title set."' },
        ]);
      },
    );
  });

  test.each([
    ["the view's result omitted", "result"],
    ["its assistant omitted", "assistant"],
    ["its call list replaced", "calls"],
  ] as const)(
    "with %s, the pruned earlier read-back is not restored: none (H9)",
    async (_name, removal) => {
      await withConversation(
        [
          round([changeTool, "c0", ok("R1")]),
          round([changeTool, "c1", ok("R2")]),
        ],
        async (root) => {
          await write(root, "prune:1", pruneEdits(await root.context(context)));
          const view = await root.context(context);
          expect(stateOf(view)).toBe("current read-back R2");
          const assistant = view.messages.find(
            (message) =>
              message.role === "assistant" &&
              message.content.some(
                (part) => part.type === "toolCall" && part.id === "c1",
              ),
          );
          const edit =
            removal === "result"
              ? { target: resultEntryOf(view, "c1"), action: "omit" as const }
              : removal === "assistant"
                ? {
                    target: assistantEntryOf(view, "c1"),
                    action: "omit" as const,
                  }
                : {
                    target: assistantEntryOf(view, "c1"),
                    action: "replace" as const,
                    messages: [
                      {
                        ...assistant!,
                        content: [
                          fauxToolCall(changeTool, ok("R9"), { id: "other" }),
                        ],
                      } as Message,
                    ],
                  };
          await write(root, "remove", [edit]);
          expect(stateOf(await root.context(context))).toBe("none");
        },
      );
    },
  );
});

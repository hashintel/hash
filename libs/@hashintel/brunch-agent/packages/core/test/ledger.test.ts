import * as v from "valibot";
import { describe, expect, test } from "vitest";

import {
  compileLedger,
  composeLedgerProfile,
  ledgerCommitInputSchemas,
  prepareLedgerCommit,
  reconstructLedger,
  type LedgerChange,
  type LedgerCommitOutput,
  type LedgerHistoryMessage,
} from "../src/ledger";

const profile = composeLedgerProfile({
  id: "test",
  title: "Test Ledger",
  categories: [
    {
      path: "operational",
      title: "Operational account",
      description: "Cross-cutting context.",
    },
    {
      path: "operational/resources",
      title: "Resources",
      description: "People and things.",
    },
  ],
});

type ToolPart = {
  type: "dynamic-tool";
  toolName: string;
  toolCallId: string;
  state: string;
  input: unknown;
  output?: unknown;
};

type Call = { id: string; changes: LedgerChange[] };

/**
 * A host shaped like Flue's history: every step of one response appends to a
 * single assistant message. A proposal's calls run either all before any
 * settles, or one after another.
 */
const conversation = () => {
  const messages: LedgerHistoryMessage[] = [];
  let response: ToolPart[] | undefined;
  let userCount = 0;
  const run = (
    calls: Call[],
    execution: "parallel" | "sequential",
  ): LedgerCommitOutput[] => {
    if (!response) {
      response = [];
      messages.push({
        id: `assistant-${messages.length}`,
        role: "assistant",
        purpose: "assistant",
        parts: response,
      });
    }
    const parts = response;
    const offset = parts.length;
    parts.push(
      ...calls.map(
        ({ id, changes }): ToolPart => ({
          type: "dynamic-tool",
          toolName: "ledger_commit",
          toolCallId: id,
          state: "input-available",
          input: { changes },
        }),
      ),
    );
    const settle = (index: number, output: LedgerCommitOutput) => {
      const part = parts[offset + index]!;
      parts[offset + index] = { ...part, state: "output-available", output };
    };
    const decide = ({ id, changes }: Call) =>
      prepareLedgerCommit({
        history: { messages },
        toolCallId: id,
        changes,
        profile,
      });
    if (execution === "sequential")
      return calls.map((call, index) => {
        const output = decide(call);
        settle(index, output);
        return output;
      });
    const outputs = calls.map(decide);
    for (const [index, output] of outputs.entries()) settle(index, output);
    return outputs;
  };
  return {
    messages,
    history: () => ({ messages }),
    user: () => {
      userCount += 1;
      const id = `user-${userCount}`;
      messages.push({ id, role: "user", purpose: "user", parts: [] });
      response = undefined;
      return id;
    },
    propose: (...calls: Call[]) => run(calls, "parallel"),
    proposeSequentially: (...calls: Call[]) => run(calls, "sequential"),
  };
};

const add = (
  address = "operational/resources",
  content = "Loading requires two people.",
): LedgerChange => ({ op: "add", address, content });

const markdownOf = (
  commits: ReturnType<typeof reconstructLedger>,
  options?: Parameters<typeof compileLedger>[2],
) => {
  const compiled = compileLedger(commits, profile, options);
  if (compiled.status !== "compiled") throw new Error(compiled.message);
  return compiled.markdown;
};

describe("ledger_commit", () => {
  test("the host assigns identity, addresses and the preceding user message", () => {
    const chat = conversation();
    const userId = chat.user();
    expect(chat.propose({ id: "c1", changes: [add()] })).toEqual([
      {
        status: "recorded",
        commitId: "c1",
        revision: 1,
        notes: [{ address: "operational/resources/n1" }],
      },
    ]);
    expect(reconstructLedger(chat.history())).toEqual([
      {
        commitId: "c1",
        revision: 1,
        afterMessageId: userId,
        notes: [
          {
            id: "n1",
            address: "operational/resources/n1",
            category: "operational/resources",
            content: "Loading requires two people.",
          },
        ],
      },
    ]);
  });

  test("a later call in the same turn supersedes a Note by id; both stay visible", () => {
    const chat = conversation();
    chat.user();
    chat.propose({ id: "c1", changes: [add()] });
    const [second] = chat.propose({
      id: "c2",
      changes: [
        {
          op: "supersede",
          address: "n1",
          content: "Three for hazardous loads.",
        },
      ],
    });
    expect(second).toMatchObject({
      status: "recorded",
      notes: [
        {
          address: "operational/resources/n2",
          supersedes: "operational/resources/n1",
        },
      ],
    });
    const view = markdownOf(reconstructLedger(chat.history()));
    expect(view).toContain("Loading requires two people.");
    expect(view).toContain("Three for hazardous loads.");
    expect(view).toContain("[n1 — superseded by n2]");
    expect(view).toContain("[n2 — supersedes n1]");
  });

  test("competing successors all remain; an exact read excludes its relatives", () => {
    const chat = conversation();
    chat.propose({ id: "c1", changes: [add()] });
    chat.propose({
      id: "c2",
      changes: [
        {
          op: "supersede",
          address: "n1",
          content: "Three for hazardous loads.",
        },
        {
          op: "supersede",
          address: "operational/resources/n1",
          content: "Three when the second bay is open.",
        },
      ],
    });
    const commits = reconstructLedger(chat.history());
    expect(markdownOf(commits)).toContain("[n1 — superseded by n2, n3]");
    const exact = markdownOf(commits, { address: "n2" });
    expect(exact).toContain("Three for hazardous loads.");
    expect(exact).not.toContain("second bay");
    expect(exact).not.toContain("Loading requires");
  });

  test("a sibling that runs before an earlier one settles is refused and consumes no ids", () => {
    const chat = conversation();
    const outputs = chat.propose(
      { id: "a", changes: [add()] },
      { id: "b", changes: [add("operational", "Context.")] },
    );
    expect(outputs[0]).toMatchObject({
      status: "recorded",
      notes: [{ address: "operational/resources/n1" }],
    });
    expect(outputs[1]).toMatchObject({
      status: "refused",
      code: "concurrent-commit",
      revision: 0,
    });
    expect(chat.propose({ id: "c", changes: [add()] })[0]).toMatchObject({
      notes: [{ address: "operational/resources/n2" }],
    });
    expect(
      reconstructLedger(chat.history()).map(({ commitId }) => commitId),
    ).toEqual(["a", "c"]);
  });

  test("siblings that run one after another both record in order", () => {
    const chat = conversation();
    const outputs = chat.proposeSequentially(
      { id: "a", changes: [add()] },
      {
        id: "b",
        changes: [{ op: "supersede", address: "n1", content: "Three." }],
      },
    );
    expect(outputs.map((output) => output.status)).toEqual([
      "recorded",
      "recorded",
    ]);
    expect(outputs[1]).toMatchObject({
      notes: [
        {
          address: "operational/resources/n2",
          supersedes: "operational/resources/n1",
        },
      ],
    });
  });

  test("an unsettled call in an earlier response does not block later commits", () => {
    const chat = conversation();
    chat.user();
    chat.messages.push({
      id: "abandoned",
      role: "assistant",
      purpose: "assistant",
      parts: [
        {
          type: "dynamic-tool",
          toolName: "ledger_commit",
          toolCallId: "lost",
          state: "input-available",
          input: { changes: [add()] },
        },
      ],
    });
    chat.user();
    expect(chat.propose({ id: "c1", changes: [add()] })[0]).toMatchObject({
      status: "recorded",
      notes: [{ address: "operational/resources/n1" }],
    });
  });

  test("unknown categories and targets refuse the whole batch and consume no ids", () => {
    const chat = conversation();
    expect(
      chat.propose({ id: "c1", changes: [add(), add("invented")] })[0],
    ).toMatchObject({ status: "refused", code: "unknown-category" });
    expect(
      chat.propose({
        id: "c2",
        changes: [
          add(),
          { op: "supersede", address: "operational/resources", content: "x" },
        ],
      })[0],
    ).toMatchObject({ status: "refused", code: "unknown-note" });
    expect(chat.propose({ id: "c3", changes: [add()] })[0]).toMatchObject({
      revision: 1,
      notes: [{ address: "operational/resources/n1" }],
    });
  });

  test("re-running a recorded call against the same history yields the same result", () => {
    const chat = conversation();
    chat.propose({ id: "c1", changes: [add()] });
    const [recorded] = chat.propose({
      id: "c2",
      changes: [{ op: "supersede", address: "n1", content: "Three." }],
    });
    expect(
      prepareLedgerCommit({
        history: chat.history(),
        toolCallId: "c2",
        changes: [{ op: "supersede", address: "n1", content: "Three." }],
        profile,
      }),
    ).toEqual(recorded);
  });

  test("a call missing from history is an infrastructure error, not a refusal", () => {
    expect(() =>
      prepareLedgerCommit({
        history: { messages: [] },
        toolCallId: "absent",
        changes: [add()],
        profile,
      }),
    ).toThrow(/does not contain ledger_commit call absent/);
  });
});

describe("reconstructLedger", () => {
  const withPart = (part: Partial<ToolPart>): LedgerHistoryMessage[] => [
    {
      id: "assistant",
      role: "assistant",
      purpose: "assistant",
      parts: [
        {
          type: "dynamic-tool",
          toolName: "ledger_commit",
          toolCallId: "c1",
          state: "output-available",
          input: { changes: [add()] },
          output: {
            status: "recorded",
            commitId: "c1",
            revision: 1,
            notes: [{ address: "operational/resources/n1" }],
          },
          ...part,
        },
      ],
    },
  ];

  test("accepts a joined input and successful output", () => {
    expect(reconstructLedger({ messages: withPart({}) })).toHaveLength(1);
  });

  test.each([
    ["pending", { state: "input-available", output: undefined }],
    ["failed", { state: "output-error" }],
    [
      "refused",
      {
        output: {
          status: "refused",
          code: "unknown-note",
          message: "x",
          revision: 0,
        },
      },
    ],
    ["malformed input", { input: { changes: "not a list" } }],
    [
      "bound to another call",
      {
        output: {
          status: "recorded",
          commitId: "other",
          revision: 1,
          notes: [{ address: "operational/resources/n1" }],
        },
      },
    ],
    [
      "addresses the input does not yield",
      {
        output: {
          status: "recorded",
          commitId: "c1",
          revision: 1,
          notes: [{ address: "operational/n1" }],
        },
      },
    ],
  ])("ignores a %s call", (_label, part) => {
    expect(reconstructLedger({ messages: withPart(part) })).toEqual([]);
  });
});

describe("compileLedger", () => {
  test("historical prefixes and refusals never fall back to the latest view", () => {
    const chat = conversation();
    chat.propose({ id: "c1", changes: [add()] });
    chat.propose({
      id: "c2",
      changes: [{ op: "supersede", address: "n1", content: "Three people." }],
    });
    const commits = reconstructLedger(chat.history());
    expect(markdownOf(commits, { revision: 1 })).not.toContain("Three people");
    expect(markdownOf(commits, { revision: 0 })).not.toContain("Loading");
    expect(compileLedger(commits, profile, { revision: 3 })).toMatchObject({
      status: "refused",
      code: "unknown-revision",
    });
    expect(
      compileLedger(commits, profile, { revision: 1, address: "n2" }),
    ).toMatchObject({ status: "refused", code: "unknown-address" });
    expect(
      compileLedger(commits, profile, { address: "operation" }),
    ).toMatchObject({ status: "refused", code: "unknown-address" });
  });

  test("a category read includes its descendants only", () => {
    const chat = conversation();
    chat.propose({
      id: "c1",
      changes: [add("operational", "Cross-cutting context."), add()],
    });
    const commits = reconstructLedger(chat.history());
    const parent = markdownOf(commits, { address: "operational" });
    expect(parent).toContain("[n1]");
    expect(parent).toContain("[n2]");
    expect(parent).not.toContain("Purpose and posture");
    expect(
      markdownOf(commits, { address: "operational/resources" }),
    ).not.toContain("[n1]");
  });

  test("typed fields render and index open and contested Notes nothing supersedes", () => {
    const chat = conversation();
    chat.propose({
      id: "c1",
      changes: [
        {
          ...add(),
          source: "person",
          basis: "estimated",
          standing: "tentative",
          precision: "approximate",
          qualifier: "not site-validated",
        },
        {
          ...add("open-matters", "Crew size at night?"),
          source: "agent",
          standing: "open",
        },
        {
          ...add("operational", "Records say three."),
          source: "material",
          basis: "observed",
          standing: "contested",
        },
      ],
    });
    chat.propose({
      id: "c2",
      changes: [
        {
          op: "supersede",
          address: "n2",
          content: "Two at night.",
          source: "person",
          standing: "settled",
        },
      ],
    });
    const view = markdownOf(reconstructLedger(chat.history()));
    expect(view).toContain(
      "[n1 — person/estimated; tentative; approximate; not site-validated]",
    );
    expect(view).toContain(
      "Open, not superseded: none. Contested, not superseded: n3.",
    );
    expect(view).toContain("[n2 — superseded by n4; agent; open]");
  });
});

describe("commit input schemas", () => {
  const typed = (change: Record<string, unknown>) =>
    v.safeParse(ledgerCommitInputSchemas.typed, { changes: [change] }).success;
  const open = (change: Record<string, unknown>) =>
    v.safeParse(ledgerCommitInputSchemas.open, { changes: [change] }).success;

  test("typed Notes require source and standing and refuse bookkeeping fields", () => {
    const base = { ...add(), source: "person", standing: "settled" };
    expect(typed(base)).toBe(true);
    expect(typed(add())).toBe(false);
    expect(typed({ ...base, standing: "verified" })).toBe(false);
    for (const [key, value] of Object.entries({
      id: "n9",
      sourceIds: [],
      expectedVersion: 1,
      disposition: "direct",
    }))
      expect(typed({ ...base, [key]: value })).toBe(false);
  });

  test("open Notes take only a free-text disposition", () => {
    expect(open({ ...add(), disposition: "guessed; not yet shown" })).toBe(
      true,
    );
    expect(open({ ...add(), standing: "settled" })).toBe(false);
  });
});

describe("composeLedgerProfile", () => {
  test("core categories surround the plugin's and paths are validated", () => {
    expect(profile.categories.map(({ path }) => path)).toEqual([
      "purpose",
      "operational",
      "operational/resources",
      "open-matters",
      "delivery",
    ]);
    const category = (path: string) => ({ path, title: path, description: "" });
    expect(() =>
      composeLedgerProfile({
        id: "x",
        title: "x",
        categories: [category("a/b")],
      }),
    ).toThrow(/precedes its parent/);
    expect(() =>
      composeLedgerProfile({
        id: "x",
        title: "x",
        categories: [category("purpose")],
      }),
    ).toThrow(/duplicated/);
    expect(() =>
      composeLedgerProfile({
        id: "x",
        title: "x",
        categories: [category("Bad")],
      }),
    ).toThrow(/kebab-case/);
  });
});

import { useInstruction, useTool } from "@flue/runtime";
import { expect, test, vi } from "vitest";

import { brunchTools } from "../src/constants";
import { useBrunchAgent } from "../src/flue";
import { composeLedgerProfile, type LedgerHistory } from "../src/ledger";

// Only the Flue build packages skills; these tests exercise the hook around it.
vi.mock("@hashintel/brunch-agent/skills/elicitation/SKILL.md", () => ({
  default: { name: "elicitation" },
}));

vi.mock("@flue/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@flue/runtime")>()),
  useModel: vi.fn<typeof import("@flue/runtime").useModel>(),
  useSkill: vi.fn<typeof import("@flue/runtime").useSkill>(),
  useTool: vi.fn<typeof useTool>(),
  useInstruction: vi.fn<typeof useInstruction>(),
}));

const profile = composeLedgerProfile({
  id: "test",
  title: "Test Ledger",
  categories: [],
});

const history: LedgerHistory = {
  messages: [
    { id: "u1", role: "user", purpose: "user", parts: [] },
    {
      id: "a1",
      role: "assistant",
      purpose: "assistant",
      parts: [
        {
          type: "dynamic-tool",
          toolName: brunchTools.ledgerCommit,
          toolCallId: "c1",
          state: "input-available",
          input: {
            changes: [
              {
                op: "add",
                address: "purpose",
                content: "Size the night crew.",
                source: "person",
                standing: "settled",
              },
            ],
          },
        },
      ],
    },
  ],
};

const context = {
  log: { info: () => {}, warn: () => {}, error: () => {} },
} as const;

const mounted = (noteShape: "typed" | "open") => {
  vi.mocked(useTool).mockClear();
  vi.mocked(useInstruction).mockClear();
  useBrunchAgent("anthropic/faux", undefined, {
    profile,
    noteShape,
    readHistory: async () => history,
  });
  return vi.mocked(useTool).mock.calls.map(([definition]) => definition);
};

test("mounts the Ledger tools, which read the conversation's history when they run", async () => {
  const tools = mounted("typed");
  expect(tools.map(({ name }) => name)).toEqual([
    brunchTools.ledgerCommit,
    brunchTools.ledgerCompile,
  ]);
  const [commit] = tools;
  expect(commit?.description).toContain("purpose: What the model must support");
  const change = {
    op: "add",
    address: "purpose",
    content: "Size the night crew.",
    source: "person",
    standing: "settled",
  };
  expect(
    await commit?.run({
      ...context,
      data: { changes: [change] },
      toolCallId: "c1",
    }),
  ).toEqual({
    output: {
      status: "recorded",
      commitId: "c1",
      revision: 1,
      notes: [{ address: "purpose/n1" }],
    },
    terminate: false,
  });
});

test("only the typed shape receives guidance naming the epistemic vocabulary", () => {
  const vocabulary = /standing|contested|tentative/u;
  const seen = (shape: "typed" | "open") => {
    const tools = mounted(shape);
    return [
      ...vi.mocked(useInstruction).mock.calls.map(([text]) => text),
      tools[1]?.description ?? "",
    ].join("\n");
  };
  expect(seen("typed")).toMatch(vocabulary);
  expect(seen("open")).not.toMatch(vocabulary);
});

test("the Note shape selects the commit input schema", () => {
  const schemaOf = (shape: "typed" | "open") =>
    JSON.stringify(mounted(shape)[0]?.input);
  expect(schemaOf("typed")).toContain("standing");
  expect(schemaOf("open")).toContain("disposition");
  expect(schemaOf("open")).not.toContain("standing");
});

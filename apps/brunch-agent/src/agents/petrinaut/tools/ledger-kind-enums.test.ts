// Live probes need BRUNCH_LIVE_MODEL_TESTS=1 and the chat model's API key.
import { createModels, type Context } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { type FlueLogger, type ToolStep } from "@flue/runtime";
import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import { describe, expect, test, vi } from "vitest";

import {
  brunchTools,
  entityKindStages,
  foldCommits,
  type LedgerAppend,
  type LedgerHistory,
  type LedgerHistoryMessage,
  netElementKinds,
  prepareAppend,
  projectLedger,
  renderLedgerMarkdown,
  vClaim,
  vEntity,
  vEntityKind,
  vLedgerAppend,
  vOrigin,
  vReflection,
  vStatus,
} from "@hashintel/brunch-agent";

import { openaiProviderWithAddedModels } from "../../../server/openai-provider.ts";
import {
  selectChatModelSpecifier,
  selectChatThinking,
} from "../../../shared/chat-model.ts";
import {
  commitToolDescription,
  createLedgerCommitTool,
  createLedgerCompileTool,
} from "./ledger.ts";

type Batch = LedgerAppend["entries"];

/** Parses plain entry literals into the branded batch the schemas produce. */
const toBatch = (entries: unknown): Batch =>
  v.parse(vLedgerAppend, { entries }).entries;

interface MutableToolPart {
  type: "dynamic-tool";
  toolName: string;
  toolCallId: string;
  state: string;
  input?: unknown;
  output?: unknown;
}

const commitPart = (toolCallId: string, entries: Batch): MutableToolPart => ({
  type: "dynamic-tool",
  toolName: brunchTools.ledgerCommit,
  toolCallId,
  state: "input-available",
  input: { entries },
});

/**
 * A history where each batch sits in its own turn as a settled `ledger_commit`
 * whose recorded output is exactly what `prepareAppend` issued, so the fold
 * discipline itself is what the assertions exercise.
 */
const settledHistory = (batches: readonly Batch[]): LedgerHistory => {
  const messages: LedgerHistoryMessage[] = [];
  batches.forEach((entries, index) => {
    const toolCallId = `commit-${index + 1}`;
    const part = commitPart(toolCallId, entries);
    messages.push(
      { id: `turn-${index + 1}`, role: "user", parts: [] },
      { id: `response-${index + 1}`, role: "assistant", parts: [part] },
    );
    part.output = prepareAppend({ history: { messages }, toolCallId, entries });
    part.state = "output-available";
  });
  return { messages };
};

const log = () => ({
  info: vi.fn<FlueLogger["info"]>(),
  warn: vi.fn<FlueLogger["warn"]>(),
  error: vi.fn<FlueLogger["error"]>(),
});

/** A pass-through durable-step surface; nothing is recorded in tests. */
const step: ToolStep = {
  do: async (_name, fn) => await fn(),
};

/** Runs the real commit tool as the next call after the settled batches. */
const runCommit = async (prior: readonly Batch[], entries: Batch) => {
  const settled = settledHistory(prior);
  const toolCallId = `commit-${prior.length + 1}`;
  const history: LedgerHistory = {
    messages: [
      ...settled.messages,
      { id: `turn-${prior.length + 1}`, role: "user", parts: [] },
      {
        id: `response-${prior.length + 1}`,
        role: "assistant",
        parts: [commitPart(toolCallId, entries)],
      },
    ],
  };
  const tool = createLedgerCommitTool(async () => history);
  const result = await tool.run({
    data: v.parse(tool.input, { entries }),
    toolCallId,
    log: log(),
    step,
  });
  return v.parse(tool.output, result.output);
};

test("one mixed append batch yields queue-aligned IDs and resolved references", async () => {
  const batch = toBatch([
    [
      "entity/create",
      {
        name: "Dryer",
        kind: "resource",
        origin: "stated",
        status: "confirmed",
      },
    ],
    [
      "claim/create",
      {
        text: "There is one dryer, held by each batch while drying.",
        entities: ["$0"],
        origin: "stated",
        status: "confirmed",
      },
    ],
    [
      "reflection/create",
      {
        text: "Represented dryer capacity as one available token; batches do not yet hold or release it.",
        claims: ["$1"],
      },
    ],
    [
      "reflection/create",
      {
        text: "The place represents available dryer capacity.",
        netElements: [{ kind: "place", id: "p-dryer" }],
        entities: ["$0"],
        claims: ["$1"],
      },
    ],
  ]);
  const receipt = await runCommit([], batch);
  expect(receipt).toEqual({
    status: "recorded",
    commitId: "commit-1",
    revision: 1,
    ids: ["e1", "c1", "r1", "r2"],
    exchanges: 1,
    openQuestions: 0,
  });
  const { state, revision } = foldCommits(settledHistory([batch]));
  expect(revision).toBe(1);
  expect(state.turns.map(({ id }) => id)).toEqual(["turn-1"]);
  expect(state.entities).toEqual([
    {
      address: "e1",
      name: "Dryer",
      kind: "resource",
      origin: "stated",
      status: "confirmed",
      turn: "turn-1",
    },
  ]);
  expect(
    state.claims.map(({ address, entities }) => ({ address, entities })),
  ).toEqual([{ address: "c1", entities: ["e1"] }]);
  expect(
    state.reflections.map(({ address, claims, entities }) => ({
      address,
      claims,
      entities,
    })),
  ).toEqual([
    { address: "r1", claims: ["c1"], entities: undefined },
    { address: "r2", claims: ["c1"], entities: ["e1"] },
  ]);
});

test("entity routes split creation from full update of an addressed entity", async () => {
  const update = {
    name: "Staffing horizon",
    kind: "horizon",
    origin: "stated",
    status: "confirmed",
  } as const;
  const creations = toBatch([
    [
      "entity/create",
      {
        name: "staffing-horizon",
        kind: "horizon",
        origin: "assumed",
        status: "tentative",
      },
    ],
    [
      "entity/create",
      {
        name: "investment-horizon",
        kind: "horizon",
        origin: "stated",
        status: "confirmed",
      },
    ],
  ]);
  const updateBatch = toBatch([["entity/update/e1", update]]);
  const receipt = await runCommit([creations], updateBatch);
  expect(receipt).toEqual({
    status: "recorded",
    commitId: "commit-2",
    revision: 2,
    ids: ["e1"],
    exchanges: 2,
    openQuestions: 0,
  });
  const { state } = foldCommits(settledHistory([creations, updateBatch]));
  expect(
    state.entities.map(({ address, name, origin }) => ({
      address,
      name,
      origin,
    })),
  ).toEqual([
    { address: "e1", name: "Staffing horizon", origin: "stated" },
    { address: "e2", name: "investment-horizon", origin: "stated" },
  ]);
  expect(v.safeParse(vEntity, { ...update, id: "e1" }).success).toBe(false);
  expect(
    v.safeParse(vLedgerAppend, {
      entries: [
        ["entity/update/e1", { name: update.name, status: update.status }],
      ],
    }).success,
  ).toBe(false);
  // The payload replaces every field, so a default must not overwrite how
  // the entity stood: an update restates origin and status.
  const { origin: _origin, ...withoutOrigin } = update;
  const { status: _status, ...withoutStatus } = update;
  for (const payload of [withoutOrigin, withoutStatus])
    expect(
      v.safeParse(vLedgerAppend, {
        entries: [["entity/update/e1", payload]],
      }).success,
    ).toBe(false);
  for (const route of ["entity/update", "entity/update/c1", "entity/update/$0"])
    expect(
      v.safeParse(vLedgerAppend, { entries: [[route, update]] }).success,
    ).toBe(false);
});

test("updates and references to absent records are refused as unknown addresses", async () => {
  const entity = {
    name: "Dryer",
    kind: "resource",
    origin: "stated",
    status: "confirmed",
  } as const;
  const updateUnknown = await runCommit(
    [],
    toBatch([["entity/update/e9", entity]]),
  );
  expect(updateUnknown).toEqual({
    status: "refused",
    applied: false,
    code: "unknown-address",
    message: "Unknown entity e9; entity/update addresses an existing record.",
    revision: 0,
  });
  const referenceUnknown = await runCommit(
    [],
    toBatch([
      [
        "reflection/create",
        {
          text: "Used a 20-minute mean drying time for the stated drying duration.",
          claims: ["c99"],
        },
      ],
    ]),
  );
  expect(referenceUnknown).toMatchObject({
    status: "refused",
    code: "unknown-address",
    message: "Unknown claim c99.",
  });
});

test("committed records accept references from later turns", async () => {
  const prior = toBatch([
    [
      "entity/create",
      {
        name: "Dryer",
        kind: "resource",
        origin: "stated",
        status: "confirmed",
      },
    ],
    [
      "claim/create",
      {
        text: "Drying always takes 20 minutes.",
        entities: ["$0"],
        origin: "stated",
        status: "confirmed",
      },
    ],
  ]);
  const receipt = await runCommit(
    [prior],
    toBatch([
      [
        "reflection/create",
        {
          text: "Approximated the fixed drying duration with a 20-minute mean.",
          claims: ["c1"],
          entities: ["e1"],
        },
      ],
    ]),
  );
  expect(receipt).toEqual({
    status: "recorded",
    commitId: "commit-2",
    revision: 2,
    ids: ["r1"],
    exchanges: 2,
    openQuestions: 0,
  });
  const empty = await runCommit([prior], []);
  expect(empty).toEqual({
    status: "recorded",
    commitId: "commit-2",
    revision: 2,
    ids: [],
    exchanges: 2,
    openQuestions: 0,
  });
});

test("a commit after an unsettled sibling in the same response is refused", () => {
  const entries = toBatch([
    [
      "entity/create",
      {
        name: "Dryer",
        kind: "resource",
        origin: "stated",
        status: "confirmed",
      },
    ],
  ]);
  const history: LedgerHistory = {
    messages: [
      { id: "turn-1", role: "user", parts: [] },
      {
        id: "response-1",
        role: "assistant",
        parts: [
          commitPart("commit-1", entries),
          commitPart("commit-2", entries),
        ],
      },
    ],
  };
  expect(prepareAppend({ history, toolCallId: "commit-2", entries })).toEqual({
    status: "refused",
    applied: false,
    code: "concurrent-commit",
    message:
      "An earlier ledger_commit in this response has not settled; wait for its result.",
    revision: 0,
  });
});

test("the fold rejects a commit whose recorded receipt disagrees with its input", () => {
  const batch = toBatch([
    [
      "entity/create",
      {
        name: "Dryer",
        kind: "resource",
        origin: "stated",
        status: "confirmed",
      },
    ],
  ]);
  const history = settledHistory([batch]);
  const intact = foldCommits(history);
  expect(intact.revision).toBe(1);
  const assistant = history.messages[1];
  const part = assistant?.parts[0] as MutableToolPart | undefined;
  if (part === undefined) throw new Error("Missing fabricated commit part");
  part.output = { ...(part.output as object), ids: ["e9"] };
  const tampered = foldCommits(history);
  expect(tampered.revision).toBe(0);
  expect(tampered.state.entities).toEqual([]);
});

test("a rejected commit keeps its IDs reserved and does not derail later commits", () => {
  const resource = (name: string) =>
    toBatch([
      [
        "entity/create",
        { name, kind: "resource", origin: "stated", status: "confirmed" },
      ],
    ]);
  const rejectSecond = (
    label: string,
    reject: (part: MutableToolPart) => Partial<MutableToolPart>,
  ) => {
    const history = settledHistory([
      resource("Dryer"),
      resource("Oven"),
      resource("Fridge"),
    ]);
    const second = history.messages[3]?.parts[0] as MutableToolPart | undefined;
    if (second === undefined) throw new Error("Missing second commit part");
    Object.assign(second, reject(second));
    const folded = foldCommits(history);
    expect(
      {
        commits: folded.commits.map(({ commitId }) => commitId),
        rejected: folded.rejected,
        revision: folded.revision,
        entities: folded.state.entities.map(
          ({ address, name }) => `${address} ${name}`,
        ),
      },
      label,
    ).toEqual({
      commits: ["commit-1", "commit-3"],
      rejected: ["commit-2"],
      revision: 2,
      entities: ["e1 Dryer", "e3 Fridge"],
    });
    const entries = resource("Mixer");
    const next: LedgerHistory = {
      messages: [
        ...history.messages,
        { id: "turn-4", role: "user", parts: [] },
        {
          id: "response-4",
          role: "assistant",
          parts: [commitPart("commit-4", entries)],
        },
      ],
    };
    expect(
      prepareAppend({ history: next, toolCallId: "commit-4", entries }),
      label,
    ).toMatchObject({ status: "recorded", revision: 3, ids: ["e4"] });
  };
  // A receipt that no longer matches its input: the input's derivation holds.
  rejectSecond("tampered receipt", (part) => ({
    output: { ...(part.output as object), ids: ["e9"] },
  }));
  // An input that today's schema no longer accepts: the receipt's IDs hold.
  rejectSecond("input no longer valid", () => ({
    input: {
      entries: [
        [
          "entity/create",
          {
            name: "Oven",
            kind: "retired-kind",
            origin: "stated",
            status: "confirmed",
          },
        ],
      ],
    },
  }));
});

test("a commit whose own call is missing from history throws", () => {
  const entries = toBatch([
    [
      "entity/create",
      {
        name: "Dryer",
        kind: "resource",
        origin: "stated",
        status: "confirmed",
      },
    ],
  ]);
  const history: LedgerHistory = {
    messages: [
      { id: "turn-1", role: "user", parts: [] },
      {
        id: "response-1",
        role: "assistant",
        parts: [commitPart("commit-1", entries)],
      },
    ],
  };
  expect(() =>
    prepareAppend({ history, toolCallId: "commit-2", entries }),
  ).toThrow("Conversation history does not contain ledger_commit commit-2.");
});

test("a claim that only renders under an entity is refused without one", async () => {
  const claim = (status: string) =>
    toBatch([
      [
        "claim/create",
        { text: "Drying is slow.", entities: [], origin: "stated", status },
      ],
    ]);
  const commitWith = async (status: string) => ({
    status,
    receipt: await runCommit([], claim(status)),
  });
  const refused = await Promise.all(
    ["confirmed", "tentative", "out-of-scope"].map(commitWith),
  );
  for (const { status, receipt } of refused)
    expect(receipt, status).toEqual({
      status: "refused",
      applied: false,
      code: "claim-without-entity",
      message: `Claim $0 is ${status} but names no entity, so the Ledger map would never show it. Reference the entities it is about, or record an unresolved gap as an open claim.`,
      revision: 0,
    });
  const recorded = await Promise.all(["open", "conflicted"].map(commitWith));
  for (const { status, receipt } of recorded)
    expect(receipt, status).toMatchObject({
      status: "recorded",
      ids: ["c1"],
    });
});

test("only a recorded commit that sets endTurn in a turn that has replied ends the turn", async () => {
  const terminates = async (
    entries: unknown,
    endTurn?: boolean,
    reply = "Noted.",
    refusedFirst = false,
  ) => {
    const batch = toBatch(entries);
    const refused = { ...commitPart("commit-0", batch), state: "output-error" };
    const history: LedgerHistory = {
      messages: [
        { id: "turn-1", role: "user", parts: [] },
        {
          id: "response-1",
          role: "assistant",
          // One message per turn: a repair follows its refused call.
          parts: refusedFirst
            ? [
                { type: "text", text: reply },
                refused,
                commitPart("commit-1", batch),
              ]
            : [{ type: "text", text: reply }, commitPart("commit-1", batch)],
        },
      ],
    };
    const tool = createLedgerCommitTool(async () => history);
    const result = await tool.run({
      data: v.parse(tool.input, {
        entries: batch,
        ...(endTurn === undefined ? {} : { endTurn }),
      }),
      toolCallId: "commit-1",
      log: log(),
      step,
    });
    return result.terminate;
  };
  const entity = [
    [
      "entity/create",
      {
        name: "Dryer",
        kind: "resource",
        origin: "stated",
        status: "confirmed",
      },
    ],
  ];
  const unanchored = [
    [
      "claim/create",
      {
        text: "Drying is slow.",
        entities: [],
        origin: "stated",
        status: "confirmed",
      },
    ],
  ];
  expect(await terminates(entity, true)).toBe(true);
  expect(await terminates(entity)).toBe(false);
  expect(await terminates(entity, false)).toBe(false);
  expect(await terminates(unanchored, true)).toBe(false);
  expect(await terminates(entity, true, "")).toBe(false);
  expect(await terminates(entity, true, " \n")).toBe(false);
  expect(await terminates(entity, true, "Noted.", true)).toBe(true);
  expect(await terminates(entity, true, "", true)).toBe(false);
});

test("an entity update keeps the turn the entity was created in", () => {
  const { state } = foldCommits(
    settledHistory([
      toBatch([
        [
          "entity/create",
          {
            name: "dryer",
            kind: "resource",
            origin: "assumed",
            status: "tentative",
          },
        ],
      ]),
      toBatch([
        [
          "entity/update/e1",
          {
            name: "Dryer",
            kind: "resource",
            origin: "stated",
            status: "confirmed",
          },
        ],
      ]),
    ]),
  );
  expect(state.entities).toEqual([
    {
      address: "e1",
      name: "Dryer",
      kind: "resource",
      origin: "stated",
      status: "confirmed",
      turn: "turn-1",
    },
  ]);
});

test("ledger_compile renders the committed state as the Markdown map", async () => {
  const history = settledHistory([
    toBatch([
      [
        "entity/create",
        {
          name: "Dryer",
          kind: "resource",
          origin: "stated",
          status: "confirmed",
        },
      ],
    ]),
  ]);
  const tool = createLedgerCompileTool(async () => history);
  const result = await tool.run({
    data: v.parse(tool.input, {}),
    toolCallId: "compile-1",
    log: log(),
  });
  const output = v.parse(tool.output, result.output);
  expect(output.revision).toBe(1);
  expect(output.rejected).toEqual([]);
  expect(output.map).toContain("# Ledger");
  expect(output.map).toContain("Dryer");
  expect(output.map).toContain("`e1`");
});

test("ledger_compile names recorded commits the fold rejects", async () => {
  const resource = (name: string) =>
    toBatch([
      [
        "entity/create",
        { name, kind: "resource", origin: "stated", status: "confirmed" },
      ],
    ]);
  const history = settledHistory([
    resource("Dryer"),
    resource("Oven"),
    toBatch([
      [
        "claim/create",
        {
          text: "The oven runs hot.",
          entities: ["e2"],
          origin: "stated",
          status: "confirmed",
        },
      ],
    ]),
    resource("Fridge"),
  ]);
  const second = history.messages[3]?.parts[0] as MutableToolPart | undefined;
  if (second === undefined) throw new Error("Missing second commit part");
  second.output = { ...(second.output as object), ids: ["e9"] };
  const tool = createLedgerCompileTool(async () => history);
  const result = await tool.run({
    data: v.parse(tool.input, {}),
    toolCallId: "compile-1",
    log: log(),
  });
  const output = v.parse(tool.output, result.output);
  expect(output.rejected).toEqual(["commit-2", "commit-3"]);
  expect(output.revision).toBe(2);
  expect(output.map).toContain("Dryer");
  expect(output.map).toContain("Fridge");
  expect(output.map).not.toContain("Oven");
  expect(output.map).not.toContain("The oven runs hot.");
});

test("claims retain prior assertions when a later claim supersedes them", () => {
  const claims = [
    {
      text: "The staffing horizon is 13 weeks.",
      entities: ["e1"],
      origin: "stated",
      status: "confirmed",
    },
    {
      text: "Use 26 weeks for the staffing horizon instead.",
      entities: ["e1"],
      origin: "stated",
      status: "confirmed",
      supersedes: ["$0"],
    },
  ];
  const batch = {
    entries: claims.map((claim) => ["claim/create", claim]),
  };
  expect(v.parse(vLedgerAppend, batch)).toEqual(batch);
});

test("a claim's source does not imply the person's agreement", () => {
  const claim = {
    text: "The shared rota lists six nurses per shift.",
    entities: ["e2"],
    origin: "evidenced",
    status: "tentative",
  };
  expect(v.parse(vClaim, claim)).toEqual(claim);
});

test("only an entry stated without a status defaults to confirmed", () => {
  const claim = {
    text: "Press 2 idles when its hopper is empty.",
    entities: ["e2"],
  };
  expect(v.parse(vClaim, claim)).toEqual({
    ...claim,
    origin: "stated",
    status: "confirmed",
  });
  expect(v.parse(vClaim, { ...claim, status: "tentative" })).toEqual({
    ...claim,
    origin: "stated",
    status: "tentative",
  });
  const inferred = v.safeParse(vClaim, { ...claim, origin: "inferred" });
  expect(inferred.success).toBe(false);
  expect(inferred.issues?.[0]?.message).toMatch(/origin is inferred/);
  expect(v.parse(vEntity, { name: "Press 2", kind: "resource" })).toMatchObject(
    { origin: "stated", status: "confirmed" },
  );
  expect(
    v.safeParse(vEntity, {
      name: "Press 2",
      kind: "resource",
      origin: "assumed",
    }).success,
  ).toBe(false);
});

test("claim and reflection requests exclude system-owned metadata", () => {
  const claim = {
    text: "Drying always takes 20 minutes.",
    entities: ["e23"],
    origin: "stated",
    status: "confirmed",
  };
  const reflection = {
    text: "Approximated the fixed drying duration with a 20-minute mean; variability absent from the account is introduced.",
    claims: ["c45"],
  };
  expect(v.parse(vClaim, claim)).toEqual(claim);
  expect(v.parse(vReflection, reflection)).toEqual(reflection);
  expect(v.safeParse(vClaim, { ...claim, id: "c46", turn: 2 }).success).toBe(
    false,
  );
  expect(
    v.safeParse(vReflection, { ...reflection, revision: "revision-2", turn: 2 })
      .success,
  ).toBe(false);
  expect(v.safeParse(vReflection, { text: reflection.text }).success).toBe(
    false,
  );
  expect(v.safeParse(vClaim, { ...claim, entities: ["c45"] }).success).toBe(
    false,
  );
});

test("local references check target kind, bounds and supersession order", () => {
  const entity = {
    name: "Dryer",
    kind: "resource",
    origin: "stated",
    status: "confirmed",
  };
  const claim = {
    text: "One dryer is available.",
    entities: ["$0"],
    origin: "stated",
    status: "confirmed",
  };
  expect(
    v.safeParse(vLedgerAppend, {
      entries: [
        ["entity/create", entity],
        ["claim/create", { ...claim, entities: ["$1"] }],
      ],
    }).success,
  ).toBe(false);
  expect(
    v.safeParse(vLedgerAppend, {
      entries: [["claim/create", { ...claim, entities: ["$9"] }]],
    }).success,
  ).toBe(false);
  expect(
    v.safeParse(vLedgerAppend, {
      entries: [
        ["entity/create", entity],
        ["claim/create", { ...claim, supersedes: ["$1"] }],
      ],
    }).success,
  ).toBe(false);
  const forwardReference = {
    entries: [
      ["claim/create", { ...claim, entities: ["$1"] }],
      ["entity/create", entity],
    ],
  };
  expect(v.parse(vLedgerAppend, forwardReference)).toEqual(forwardReference);
  const updateTarget = {
    entries: [
      ["entity/update/e45", entity],
      ["claim/create", claim],
    ],
  };
  expect(v.parse(vLedgerAppend, updateTarget)).toEqual(updateTarget);
});

test("a misdirected local reference names the entry, field and target", () => {
  const entity = {
    name: "Booster PLC",
    kind: "actor",
    origin: "stated",
    status: "confirmed",
  };
  const claim = {
    text: "The PLC acts on the last reading it received.",
    entities: ["$0"],
    origin: "stated",
    status: "confirmed",
  };
  // Run p7ZTaN: `$2` meant the third entity but named the claim between them.
  const issue = v.safeParse(vLedgerAppend, {
    entries: [
      ["entity/create", entity],
      ["entity/create", { ...entity, name: "Level reading", kind: "signal" }],
      ["claim/create", claim],
      ["entity/create", { ...entity, name: "Radio failure", kind: "event" }],
      ["claim/create", { ...claim, entities: ["$2", "$3"] }],
    ],
  }).issues?.[0]?.message;
  expect(issue).toBe(
    "entries[4] (claim/create) entities references $2, which is entries[2] (claim/create); expected an entity. $index counts every entry in this queue, whatever its route.",
  );
  expect(
    v.safeParse(vLedgerAppend, {
      entries: [["claim/create", { ...claim, entities: ["$9"] }]],
    }).issues?.[0]?.message,
  ).toBe(
    "entries[0] (claim/create) entities references $9, but the queue has 1 entries ($0 to $0); expected an entity.",
  );
});

test("the receipt counts open questions after the commit", async () => {
  const receipt = await runCommit(
    [],
    toBatch([
      [
        "entity/create",
        {
          name: "Starting level",
          kind: "thing",
          origin: "stated",
          status: "confirmed",
        },
      ],
      [
        "claim/create",
        {
          text: "The level a summer night starts at is unknown.",
          entities: ["$0"],
          origin: "stated",
          status: "open",
        },
      ],
      [
        "claim/create",
        {
          text: "The trend and the operator disagree on the 2 July peak level.",
          entities: ["$0"],
          origin: "stated",
          status: "conflicted",
        },
      ],
    ]),
  );
  expect(receipt).toMatchObject({ exchanges: 1, openQuestions: 2 });
});

test("the receipt notes an agent claim superseding the account", async () => {
  // Run p7ZTaN: a claim describing the draft superseded Gwen's stated range.
  const account = toBatch([
    [
      "entity/create",
      {
        name: "Night demand",
        kind: "thing",
        origin: "stated",
        status: "confirmed",
      },
    ],
    [
      "claim/create",
      {
        text: "Summer night demand is 15 to 25 L/s.",
        entities: ["$0"],
        origin: "stated",
        status: "confirmed",
      },
    ],
  ]);
  const receipt = await runCommit(
    [account],
    toBatch([
      [
        "claim/create",
        {
          text: "The draft scenario uses 20 L/s overnight and 80 L/s from 06:30.",
          entities: ["e1"],
          origin: "inferred",
          status: "tentative",
          supersedes: ["c1"],
        },
      ],
    ]),
  );
  expect(receipt).toMatchObject({
    status: "recorded",
    notes: [
      "c2 (inferred) supersedes c1 (stated), so the account's claim leaves the current map. Supersede it only for a correction the USER made; if both hold, record them as separate claims, each with its selecting condition.",
    ],
  });
  const correction = await runCommit(
    [account],
    toBatch([
      [
        "claim/create",
        {
          text: "Summer night demand is 18 to 22 L/s.",
          entities: ["e1"],
          origin: "stated",
          status: "confirmed",
          supersedes: ["c1"],
        },
      ],
    ]),
  );
  expect(correction).not.toHaveProperty("notes");
});

test("a claim supersedes only an earlier claim, by literal ID as by $index", async () => {
  const account = toBatch([
    [
      "entity/create",
      {
        name: "Night demand",
        kind: "thing",
        origin: "stated",
        status: "confirmed",
      },
    ],
  ]);
  const claim = {
    text: "Summer night demand is 15 to 25 L/s.",
    entities: ["e1"],
    origin: "stated",
    status: "confirmed",
  } as const;
  const selfSuperseding = toBatch([
    ["claim/create", { ...claim, supersedes: ["c1"] }],
  ]);
  expect(await runCommit([account], selfSuperseding)).toEqual({
    status: "refused",
    applied: false,
    code: "unknown-address",
    message: "Claim c1 cannot supersede c1; supersedes names an earlier claim.",
    revision: 1,
  });
  const forward = toBatch([
    ["claim/create", { ...claim, supersedes: ["c2"] }],
    ["claim/create", claim],
  ]);
  expect(await runCommit([account], forward)).toMatchObject({
    status: "refused",
    message: "Claim c1 cannot supersede c2; supersedes names an earlier claim.",
  });
  const backward = toBatch([
    ["claim/create", claim],
    ["claim/create", { ...claim, supersedes: ["c1"] }],
  ]);
  expect(await runCommit([account], backward)).toMatchObject({
    status: "recorded",
    ids: ["c1", "c2"],
  });
});

test("an obligation stays owed until a reflection discharges it", async () => {
  const owing = toBatch([
    [
      "entity/create",
      {
        name: "The 2 July overflow",
        kind: "case",
        origin: "stated",
        status: "confirmed",
      },
    ],
    [
      "obligation/create",
      {
        text: "A run at the current settings reproduces the 2 July overflow.",
        entities: ["$0"],
      },
    ],
  ]);
  expect(await runCommit([], owing)).toEqual({
    status: "recorded",
    commitId: "commit-1",
    revision: 1,
    ids: ["e1", "o1"],
    exchanges: 1,
    openQuestions: 0,
    owed: [
      {
        id: "o1",
        text: "A run at the current settings reproduces the 2 July overflow.",
      },
    ],
  });
  expect(
    renderLedgerMarkdown(
      projectLedger(foldCommits(settledHistory([owing])).state),
    ),
  ).toContain(
    "## Checks still owed\n\n- A run at the current settings reproduces the 2 July overflow. \u2014 The 2 July overflow `o1`",
  );

  expect(
    await runCommit(
      [owing],
      toBatch([
        [
          "reflection/create",
          { text: "Discharged without a run.", discharges: ["o9"] },
        ],
      ]),
    ),
  ).toMatchObject({ status: "refused", message: "Unknown obligation o9." });

  const discharging = toBatch([
    [
      "reflection/create",
      {
        text: "The current-settings run overflowed at 04:46, as on 2 July.",
        entities: ["e1"],
        discharges: ["o1"],
      },
    ],
  ]);
  const receipt = await runCommit([owing], discharging);
  expect(receipt).toEqual({
    status: "recorded",
    commitId: "commit-2",
    revision: 2,
    ids: ["r1"],
    exchanges: 2,
    openQuestions: 0,
  });
  expect(
    renderLedgerMarkdown(
      projectLedger(foldCommits(settledHistory([owing, discharging])).state),
    ),
  ).not.toContain("Checks still owed");
});

/** What Flue sends as a tool's parameters (`toolInputToJsonSchema`). */
const flueParameters = (schema: v.GenericSchema) => {
  const { $schema: _schema, ...parameters } = toJsonSchema(schema, {
    errorMode: "ignore",
  });
  return parameters;
};

type DescribedEnums = typeof vEntityKind | typeof vOrigin | typeof vStatus;

const literalsOf = (schema: DescribedEnums) =>
  schema.options.map((option) => ({
    literal: option.literal,
    description: v.getDescription(option),
  }));

test("each entity kind's description opens with its stage", () => {
  for (const option of vEntityKind.options)
    expect(v.getDescription(option)?.toLowerCase()).toMatch(
      new RegExp(`^${entityKindStages[option.literal]}: `),
    );
});

test("Flue's tool schema carries entity kind, origin and status descriptions", () => {
  const parameters = flueParameters(vLedgerAppend);
  const anyOf = (schema: DescribedEnums) => ({
    description: v.getDescription(schema),
    anyOf: literalsOf(schema).map(({ literal, description }) => ({
      const: literal,
      description,
    })),
  });
  expect(parameters).toMatchObject({
    properties: {
      entries: {
        type: "array",
        items: {
          anyOf: [
            {
              items: [
                { const: "entity/create" },
                {
                  properties: {
                    kind: anyOf(vEntityKind),
                    origin: { ...anyOf(vOrigin), default: "stated" },
                    status: anyOf(vStatus),
                  },
                  required: ["name", "kind"],
                },
              ],
            },
            {
              items: [
                {
                  type: "string",
                  pattern: "^entity\\/update\\/e(?:0|[1-9]\\d*)$",
                },
                {
                  required: ["name", "kind", "origin", "status"],
                },
              ],
            },
            {
              items: [
                { const: "claim/create" },
                {
                  properties: {
                    entities: {
                      type: "array",
                      items: {
                        anyOf: [
                          { pattern: "^e(?:0|[1-9]\\d*)$" },
                          { pattern: "^\\$(?:0|[1-9]\\d*)$" },
                        ],
                      },
                    },
                    origin: { ...anyOf(vOrigin), default: "stated" },
                    status: anyOf(vStatus),
                  },
                  required: ["text", "entities"],
                },
              ],
            },
            {
              items: [
                { const: "reflection/create" },
                {
                  properties: {
                    text: { type: "string" },
                    netElements: {
                      type: "array",
                      items: {
                        properties: { kind: { enum: netElementKinds } },
                      },
                    },
                    claims: { type: "array" },
                    entities: { type: "array" },
                    discharges: {
                      type: "array",
                      items: {
                        anyOf: [
                          { pattern: "^o(?:0|[1-9]\\d*)$" },
                          { pattern: "^\\$(?:0|[1-9]\\d*)$" },
                        ],
                      },
                    },
                  },
                  required: ["text"],
                },
              ],
            },
            {
              items: [
                { const: "obligation/create" },
                {
                  properties: {
                    text: { type: "string" },
                    claims: { type: "array" },
                    entities: { type: "array" },
                  },
                  required: ["text"],
                },
              ],
            },
          ],
        },
      },
    },
  });
});

const live = process.env.BRUNCH_LIVE_MODEL_TESTS === "1";

describe.skipIf(!live).concurrent("kind enums with a live model", () => {
  /** Sends one message with the commit tool; fails unless the call parses. */
  const append = async (
    message: string,
    {
      observation = "",
      prior = [],
    }: { observation?: string; prior?: readonly Batch[] } = {},
  ) => {
    const ledger =
      prior.length === 0
        ? "There are no existing entities or claims, so use only create routes."
        : `The ledger already holds the records below; reference them by their IDs and use create routes for new records.\n\n${renderLedgerMarkdown(projectLedger(foldCommits(settledHistory(prior)).state))}\n\n`;
    const models = createModels();
    models.setProvider(anthropicProvider());
    models.setProvider(openaiProviderWithAddedModels());
    const specifier = selectChatModelSpecifier();
    const slash = specifier.indexOf("/");
    const model = models.getModel(
      specifier.slice(0, slash),
      specifier.slice(slash + 1),
    );
    if (!model) throw new Error(`Unknown model ${specifier}`);
    const thinking = selectChatThinking();
    const context: Context = {
      systemPrompt: `You keep the record of a modelling conversation. USER means the interviewee whose account is being elicited. ${ledger} Record the USER's latest message by calling ${brunchTools.ledgerCommit} exactly once. Each entry is exactly [route, payload]. Do not assign IDs or submit turns; relationships use $index references to positions in this call's entire entries queue. Do not reply in text. ${observation}`,
      messages: [{ role: "user", content: message, timestamp: Date.now() }],
      tools: [
        {
          name: brunchTools.ledgerCommit,
          description: commitToolDescription,
          parameters: flueParameters(vLedgerAppend),
        },
      ],
    };
    const response = await models.completeSimple(model, context, {
      reasoning: thinking === "off" ? undefined : thinking,
    });
    if (response.stopReason === "error")
      throw new Error(response.errorMessage ?? "Model request failed");
    const calls = response.content.filter((block) => block.type === "toolCall");
    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (call?.type !== "toolCall")
      throw new Error(
        `No ${brunchTools.ledgerCommit} call: ${response.stopReason}`,
      );
    expect(call.name).toBe(brunchTools.ledgerCommit);
    const recorded = v.parse(vLedgerAppend, call.arguments);
    if (prior.length === 0)
      for (const [route] of recorded.entries)
        expect(route).not.toMatch(/\/update\//);
    const entities = recorded.entries.flatMap(([route, payload]) =>
      route === "entity/create" ? [payload] : [],
    );
    const claims = recorded.entries.flatMap(([route, payload]) =>
      route === "claim/create" ? [payload] : [],
    );
    const reflections = recorded.entries.flatMap(([route, payload]) =>
      route === "reflection/create" ? [payload] : [],
    );
    const obligations = recorded.entries.flatMap(([route, payload]) =>
      route === "obligation/create" ? [payload] : [],
    );
    if (prior.length === 0) {
      expect(entities.length).toBeGreaterThan(0);
      expect(claims.length).toBeGreaterThan(0);
    }
    for (const entity of entities) {
      expect(entity).not.toHaveProperty("id");
    }
    for (const claim of claims) {
      expect(claim).not.toHaveProperty("id");
      expect(claim).not.toHaveProperty("turn");
      for (const reference of claim.entities)
        expect(reference).toMatch(/^(\$\d+|e\d+)$/);
    }
    for (const reflection of reflections) {
      expect(reflection).not.toHaveProperty("revision");
      expect(reflection).not.toHaveProperty("turn");
      for (const reference of [
        ...(reflection.claims ?? []),
        ...(reflection.entities ?? []),
      ])
        expect(reference).toMatch(/^(\$\d+|[ec]\d+)$/);
    }
    const receipt = await runCommit(prior, recorded.entries);
    expect(receipt.status).toBe("recorded");
    if (receipt.status !== "recorded")
      throw new Error("Receipt expected to be recorded");
    expect(receipt.ids).toHaveLength(recorded.entries.length);
    recorded.entries.forEach(([route], index) => {
      const prefix = route.startsWith("entity/")
        ? "e"
        : route === "claim/create"
          ? "c"
          : route === "obligation/create"
            ? "o"
            : "r";
      expect(receipt.ids[index]).toMatch(new RegExp(`^${prefix}\\d+$`));
    });
    return {
      entries: recorded.entries,
      entities,
      claims,
      reflections,
      obligations,
      receipt,
    };
  };

  test("names objectives and constraints as entities from their descriptions", async () => {
    const recorded = await append(
      "What I care about is how long patients wait in A&E. We need to bring that down: an average under 4 hours would count as a success, and no patient should ever wait more than 12 hours.",
    );
    expect(recorded.entities.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining(["metric", "direction", "target", "threshold"]),
    );
    for (const claim of recorded.claims) {
      expect(claim.origin).toBe("stated");
      expect(claim.status).toBe("confirmed");
    }
  }, 120_000);

  test("pencils in an undecided resource without treating it as confirmed", async () => {
    const recorded = await append(
      "We might use agency nurses, but I haven't decided yet. If we do, only how many are free matters, not who they are.",
    );
    const nurses = recorded.entities.filter(
      ({ kind, name }) => kind === "resource" && /nurs/i.test(name),
    );
    expect(nurses).not.toHaveLength(0);
    for (const nurse of nurses) {
      expect(nurse.origin).toBe("stated");
      expect(nurse.status).toBe("tentative");
    }
  }, 120_000);

  test("records two independently named horizons", async () => {
    const recorded = await append(
      "We need two horizons: 13 weeks for staffing decisions and 104 weeks for investment decisions.",
    );
    const horizons = recorded.entities.filter(({ kind }) => kind === "horizon");
    expect(horizons).toHaveLength(2);
    const horizonReferences = recorded.entries.flatMap(
      ([route, payload], index) =>
        route === "entity/create" && payload.kind === "horizon"
          ? [`$${index}`]
          : [],
    );
    expect(recorded.claims.flatMap((claim) => claim.entities)).toEqual(
      expect.arrayContaining(horizonReferences),
    );
  }, 120_000);

  test("records a reading as a signal and its controller as an actor", async () => {
    const recorded = await append(
      "The pump controller switches the pump on the tank level reading it gets over the radio every five minutes, and sometimes those readings drop.",
    );
    expect(
      recorded.entities.filter(
        ({ kind, name }) => kind === "signal" && /reading/i.test(name),
      ),
    ).not.toHaveLength(0);
    expect(
      recorded.entities.filter(
        ({ kind, name }) => kind === "actor" && /controller/i.test(name),
      ),
    ).not.toHaveLength(0);
  }, 120_000);

  test("records the session's time as an appetite, not a horizon", async () => {
    const recorded = await append(
      "I've only got about half an hour for this today.",
    );
    expect(recorded.entities.map(({ kind }) => kind)).toContain("appetite");
    expect(recorded.entities.map(({ kind }) => kind)).not.toContain("horizon");
  }, 120_000);

  test("one tuple queue connects elicitation to an explained construction choice", async () => {
    const placeId = "73bb8e88-a8d7-4a81-99e1-8398b928d6d3";
    const recorded = await append(
      "We have one dryer. Each batch holds it for the whole drying operation.",
      {
        observation:
          `For this isolated demo, the construction observation is a fixture: ` +
          `a net tool successfully created a place with ID ${placeId}, ` +
          `name Available dryer, and one capacity token. ` +
          `This change addresses the USER's dryer-capacity assertion. ` +
          `In the same ledger_commit call, record at least one reflection that ` +
          `references the created place in netElements by kind and ID, ` +
          `links the addressed claims and the dryer entity with $index references, ` +
          `and explains the representation. ` +
          `Batch hold/release wiring has not been added; note that consequential omission in reflection text.`,
      },
    );

    const dryerReference = recorded.entries.findIndex(
      ([route, payload]) =>
        route === "entity/create" &&
        payload.kind === "resource" &&
        /dryer/i.test(payload.name),
    );
    expect(dryerReference).toBeGreaterThanOrEqual(0);
    const dryer = recorded.entities.find(
      ({ kind, name }) => kind === "resource" && /dryer/i.test(name),
    );
    expect(dryer).toBeDefined();
    const placeReflections = recorded.reflections.filter((reflection) =>
      (reflection.netElements ?? []).some(
        ({ kind, id }) => kind === "place" && id === placeId,
      ),
    );
    expect(placeReflections).not.toHaveLength(0);
    expect(
      placeReflections.flatMap((reflection) => reflection.entities ?? []),
    ).toContain(`$${dryerReference}`);
    expect(
      placeReflections.flatMap((reflection) => reflection.claims ?? []),
    ).not.toHaveLength(0);
    expect(
      recorded.reflections.some(({ text }) => /hold|release/i.test(text)),
    ).toBe(true);
  }, 120_000);

  test("records an incident as a case the model owes a check to reproduce", async () => {
    const recorded = await append(
      "It overflowed on the night of 2 July, after the storm. The 02:00 reading said 5.1 m, the pump came on at 02:10, and by the 02:20 reading it was at 5.8 m and spilling. That's the kind of night we want the model to help us stop.",
    );
    const caseReferences = recorded.entries.flatMap(
      ([route, payload], index) =>
        route === "entity/create" && payload.kind === "case"
          ? [`$${index}`]
          : [],
    );
    expect(caseReferences).not.toHaveLength(0);
    expect(
      recorded.obligations.flatMap((obligation) => obligation.entities ?? []),
    ).toEqual(expect.arrayContaining([caseReferences[0]]));
  }, 120_000);

  const overflowCase = toBatch([
    [
      "entity/create",
      {
        name: "The 2 July overflow",
        kind: "case",
        origin: "stated",
        status: "confirmed",
      },
    ],
    [
      "claim/create",
      {
        text: "On 2 July the level read 5.1 m at 02:00 and 5.8 m at 02:20, and the tank spilled.",
        entities: ["$0"],
        origin: "stated",
        status: "confirmed",
      },
    ],
    [
      "obligation/create",
      {
        text: "A run at the current settings reproduces the 2 July overflow.",
        entities: ["$0"],
        claims: ["$1"],
      },
    ],
  ]);

  test("discharges a case's obligation with the run that reproduced it", async () => {
    const recorded = await append("So, does the model reproduce 2 July?", {
      prior: [overflowCase],
      observation:
        `For this isolated demo, the construction observation is a fixture: ` +
        `an experiment tool ran the net at the current settings with the 2 July storm inflow. ` +
        `The simulated level read 5.1 m at 02:00, the pump started at 02:10, and the level reached 5.8 m at 02:20 and spilled.`,
    });
    expect(
      recorded.reflections.flatMap((reflection) => reflection.discharges ?? []),
    ).toContain("o1");
    expect(recorded.claims.map(({ origin }) => origin)).not.toContain(
      "evidenced",
    );
    expect(recorded.receipt).not.toHaveProperty("owed");
  }, 120_000);

  test("owes a sensitivity check on a stand-in a result rests on", async () => {
    const recorded = await append("Fine, what did it find?", {
      prior: [overflowCase],
      observation:
        `For this isolated demo, the construction observation is a fixture: ` +
        `the USER never gave the pump's flow rate, so a net tool built the pump transition with a placeholder of 40 l/s. ` +
        `An optimization over the pump's switch-on level then found 4.9 m best: no overflow on the 2 July inflow.`,
    });
    expect(recorded.claims.map(({ origin }) => origin)).not.toContain(
      "evidenced",
    );
    expect(
      recorded.obligations.some(({ text }) => /40|placeholder/i.test(text)),
    ).toBe(true);
    expect(recorded.receipt.owed?.map(({ id }) => id)).toContain("o1");
  }, 120_000);
});

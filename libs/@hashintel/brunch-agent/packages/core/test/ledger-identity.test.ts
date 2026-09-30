import * as v from "valibot";
import { describe, expect, test } from "vitest";

import {
  compileLedger,
  compileLedgerMap,
  composeLedgerProfile,
  identityCommitInputSchema,
  prepareIdentityLedgerCommit,
  reconstructLedger,
  type LedgerChange,
  type LedgerCommitOutput,
  type LedgerHistoryMessage,
  type LedgerVocabulary,
} from "../src/ledger";

const vocabulary = {
  title: "Model Ledger",
  dimensions: [
    {
      name: "goals",
      description: "What it is for.",
      done: "a measure is confirmed",
    },
    {
      name: "resources",
      description: "What is limited.",
      done: "capacities are known",
    },
    {
      name: "activities",
      description: "The steps.",
      done: "a case is traced",
    },
    {
      name: "quantities",
      description: "The numbers.",
      done: "durations are known",
    },
    {
      name: "actors",
      description: "Who acts.",
      done: "performers are known",
    },
  ],
  kinds: [
    { name: "goal", description: "What to achieve." },
    {
      name: "activity",
      description: "A step.",
      expects: [
        { name: "duration", description: "How long.", covers: "quantities" },
        {
          name: "performer",
          description: "Who does it.",
          covers: "actors",
          relation: { names: ["performs"], end: "to" },
        },
      ],
    },
    { name: "resource", description: "Something limited." },
    { name: "actor", description: "Someone who acts." },
  ],
  relations: [
    { name: "reserves", description: "Holds, then releases." },
    { name: "measures", description: "A goal is judged on it." },
    { name: "performs", description: "Carries out an activity." },
  ],
  fixed: [{ name: "purpose", description: "Why the model exists." }],
} as const satisfies LedgerVocabulary;

/** One commit per assistant message, each settled before the next. */
const conversation = () => {
  const messages: LedgerHistoryMessage[] = [];
  return {
    history: () => ({ messages }),
    commit: (changes: LedgerChange[]): LedgerCommitOutput => {
      const toolCallId = `c${messages.length + 1}`;
      const part = {
        type: "dynamic-tool",
        toolName: "ledger_commit",
        toolCallId,
        state: "input-available",
        input: { changes },
      };
      messages.push({
        id: `assistant-${messages.length}`,
        role: "assistant",
        parts: [part],
      });
      const output = prepareIdentityLedgerCommit({
        history: { messages },
        toolCallId,
        changes,
        vocabulary,
      });
      messages[messages.length - 1] = {
        id: `assistant-${messages.length - 1}`,
        role: "assistant",
        parts: [{ ...part, state: "output-available", output }],
      };
      return output;
    },
  };
};

const settled = { source: "person", standing: "settled" } as const;
const inferred = {
  source: "agent",
  basis: "inferred",
  standing: "tentative",
} as const;

const mapOf = (
  chat: ReturnType<typeof conversation>,
  options?: Parameters<typeof compileLedgerMap>[2],
) => {
  const compiled = compileLedgerMap(
    reconstructLedger(chat.history()),
    vocabulary.title,
    options,
  );
  if (compiled.status !== "compiled") throw new Error(compiled.message);
  return compiled.markdown;
};

const cleaningCase = () => {
  const chat = conversation();
  chat.commit([
    {
      op: "note",
      about: ["purpose"],
      content: "Can the next white batch start at 08:00 after a dark batch?",
      ...settled,
    },
    {
      op: "identify",
      identity: "cleaning",
      kind: "activity",
      content: "Dark-to-white cleaning.",
      ...settled,
    },
    { op: "identify", identity: "cleaning-crew", ...settled },
    { op: "identify", identity: "line-2", kind: "resource", ...settled },
    { op: "identify", identity: "crew-shift", ...settled },
    {
      op: "relate",
      from: "cleaning",
      relation: "reserves",
      to: "line-2",
      ...settled,
    },
    {
      op: "relate",
      from: "cleaning",
      relation: "reserves",
      to: "cleaning-crew",
      ...inferred,
    },
    {
      op: "note",
      about: ["cleaning", "cleaning-crew"],
      content: "About three hours, with the one shared crew.",
      precision: "approximate",
      ...settled,
    },
  ]);
  return chat;
};

describe("identity-addressed ledger_commit", () => {
  test("files Notes against identities and relationships, and reconstruction agrees", () => {
    const chat = cleaningCase();
    const commits = reconstructLedger(chat.history());
    expect(commits).toHaveLength(1);
    expect(commits[0]?.notes.map(({ address }) => address)).toEqual([
      "notes/purpose/n1",
      "identities/cleaning/n2",
      "identities/cleaning-crew/n3",
      "identities/line-2/n4",
      "identities/crew-shift/n5",
      "relationships/cleaning/reserves/line-2/n6",
      "relationships/cleaning/reserves/cleaning-crew/n7",
      "notes/cleaning+cleaning-crew/n8",
    ]);
    expect(commits[0]?.notes[6]).toMatchObject({
      relation: { from: "cleaning", relation: "reserves", to: "cleaning-crew" },
      source: "agent",
      standing: "tentative",
    });
  });

  test("the map derives each identity's stage and lists fixed identities' Notes", () => {
    const markdown = mapOf(cleaningCase());
    expect(markdown).toContain("## purpose");
    expect(markdown).toContain("Can the next white batch start at 08:00");
    expect(markdown).toContain(
      "- `cleaning` [activity] — confirmed; n2; 1 note; 2 relationships — Dark-to-white cleaning.",
    );
    expect(markdown).toContain("- `crew-shift` — placeholder; n5");
    expect(markdown).toContain(
      "- `cleaning` reserves `cleaning-crew` — pencilled; n7",
    );
    expect(markdown).not.toContain("About three hours");
  });

  test("confirming a pencilled relationship keeps its subject and content", () => {
    const chat = cleaningCase();
    expect(
      chat.commit([
        { op: "supersede", address: "n7", ...settled },
        { op: "supersede", address: "n3", kind: "resource", ...settled },
      ]),
    ).toMatchObject({
      status: "recorded",
      notes: [
        {
          address: "relationships/cleaning/reserves/cleaning-crew/n9",
          supersedes: "relationships/cleaning/reserves/cleaning-crew/n7",
        },
        {
          address: "identities/cleaning-crew/n10",
          supersedes: "identities/cleaning-crew/n3",
        },
      ],
    });
    const markdown = mapOf(chat);
    expect(markdown).toContain(
      "- `cleaning` reserves `cleaning-crew` — confirmed; n9",
    );
    expect(markdown).toContain("- `cleaning-crew` [resource] — confirmed; n10");
    expect(markdown).not.toContain("n7");
  });

  test("about renders every version of a subject and every Note about it", () => {
    const chat = cleaningCase();
    chat.commit([{ op: "supersede", address: "n7", ...settled }]);
    const markdown = mapOf(chat, { about: ["cleaning-crew"] });
    expect(markdown).toContain(
      "[n7 — superseded by n9; agent/inferred; tentative] relationship `cleaning` reserves `cleaning-crew`",
    );
    expect(markdown).toContain("[n9 — supersedes n7; person; settled]");
    expect(markdown).toContain("About three hours, with the one shared crew.");
  });

  test("a Note about a relationship follows it through supersession", () => {
    const chat = cleaningCase();
    chat.commit([
      {
        op: "note",
        about: ["n7"],
        content: "Draft holds the crew through inspection.",
        concerns: "draft",
        ...inferred,
      },
    ]);
    chat.commit([{ op: "supersede", address: "n7", ...settled }]);
    expect(mapOf(chat)).toContain(
      "- `cleaning` reserves `cleaning-crew` — confirmed; n10; 1 note",
    );
    expect(mapOf(chat, { about: ["n7"] })).toContain(
      "about `n7` (on the draft)",
    );
  });

  test.each<[string, LedgerChange[], string]>([
    [
      "an unknown identity",
      [
        {
          op: "relate",
          from: "cleaning",
          relation: "reserves",
          to: "forklift",
          ...settled,
        },
      ],
      "unknown-identity",
    ],
    [
      "a duplicate identity",
      [{ op: "identify", identity: "line-2", ...settled }],
      "duplicate-identity",
    ],
    [
      "an unlabelled other relation",
      [
        {
          op: "relate",
          from: "cleaning",
          relation: "other",
          to: "crew-shift",
          ...settled,
        },
      ],
      "invalid-change",
    ],
    [
      "a Note about a plain Note",
      [{ op: "note", about: ["n8"], content: "x", ...settled }],
      "invalid-change",
    ],
    [
      "a kind on a non-identity Note",
      [{ op: "supersede", address: "n6", kind: "resource", ...settled }],
      "invalid-change",
    ],
  ])("refuses %s and records nothing", (_case, changes, code) => {
    const chat = cleaningCase();
    expect(chat.commit(changes)).toMatchObject({
      status: "refused",
      applied: false,
      code,
    });
    expect(reconstructLedger(chat.history())).toHaveLength(1);
  });

  test("a relation may name an identity identified earlier in the same commit", () => {
    const chat = cleaningCase();
    expect(
      chat.commit([
        { op: "identify", identity: "forklift", kind: "resource", ...settled },
        {
          op: "relate",
          from: "cleaning",
          relation: "reserves",
          to: "forklift",
          ...inferred,
        },
      ]),
    ).toMatchObject({ status: "recorded" });
  });

  test("compileLedger renders an identity Ledger as its map and every Note", () => {
    const compiled = compileLedger(
      reconstructLedger(cleaningCase().history()),
      composeLedgerProfile({
        id: "test",
        title: "Model Ledger",
        categories: [],
      }),
    );
    expect(compiled).toMatchObject({ status: "compiled" });
    if (compiled.status !== "compiled") return;
    expect(compiled.markdown).toContain("## Identities (4)");
    expect(compiled.markdown).toContain("## Every Note");
    expect(compiled.markdown).toContain("About three hours");
  });

  test("the schema closes kinds, relations and dimensions over the vocabulary", () => {
    const schema = identityCommitInputSchema(vocabulary);
    const accepts = (change: object) =>
      v.safeParse(schema, { changes: [change] }).success;
    const identify = { op: "identify", identity: "crew", ...settled };
    expect(
      accepts({ ...identify, kind: "resource", covers: ["resources"] }),
    ).toBe(true);
    expect(
      accepts({ ...identify, kind: "machine", covers: ["resources"] }),
    ).toBe(false);
    expect(accepts({ ...identify, covers: ["validation"] })).toBe(false);
    expect(accepts(identify)).toBe(false);
    expect(accepts({ op: "supersede", address: "n1", ...settled })).toBe(true);
    expect(
      accepts({
        op: "relate",
        from: "a",
        relation: "consumes",
        to: "b",
        covers: ["activities"],
        ...settled,
      }),
    ).toBe(false);
  });
});

describe("coverage", () => {
  const coverageOf = (output: LedgerCommitOutput) =>
    output.status === "recorded" ? output.coverage : undefined;

  test("a recorded commit reports coverage by dimension, with the done criterion of each unconfirmed one", () => {
    const chat = conversation();
    const coverage = coverageOf(
      chat.commit([
        {
          op: "identify",
          identity: "cleaning",
          kind: "activity",
          content: "Dark-to-white cleaning.",
          covers: ["activities"],
          ...settled,
        },
        {
          op: "identify",
          identity: "line-2",
          covers: ["resources"],
          ...settled,
        },
        {
          op: "relate",
          from: "cleaning",
          relation: "reserves",
          to: "line-2",
          covers: ["resources", "activities"],
          ...inferred,
        },
        {
          op: "note",
          about: ["cleaning"],
          content: "Draft models cleaning as one transition.",
          concerns: "draft",
          covers: ["goals"],
          ...inferred,
        },
      ]),
    );
    expect(coverage).toBe(
      [
        "Coverage by dimension (current Notes, not those on the draft):",
        "- goals: nothing recorded; nothing confirmed — done when a measure is confirmed",
        "- resources: 1 confirmed, 1 pencilled",
        "- activities: 1 confirmed, 1 pencilled",
        "- quantities: nothing recorded; nothing confirmed — done when durations are known",
        "- actors: nothing recorded; nothing confirmed — done when performers are known",
        "Identities still missing what their kind needs:",
        "- `cleaning` [activity]: duration, performer",
      ].join("\n"),
    );
  });

  test("an identity's needs are met by the person's account, not by stand-ins or pencilled relationships", () => {
    const chat = conversation();
    const first = coverageOf(
      chat.commit([
        {
          op: "identify",
          identity: "cleaning",
          kind: "activity",
          covers: ["activities"],
          ...settled,
        },
        { op: "identify", identity: "crew", covers: ["actors"], ...settled },
        {
          op: "relate",
          from: "crew",
          relation: "performs",
          to: "cleaning",
          covers: ["actors"],
          ...inferred,
        },
        {
          op: "note",
          about: ["cleaning"],
          content: "Draft stand-in: three hours.",
          concerns: "draft",
          covers: ["quantities"],
          ...inferred,
        },
      ]),
    );
    expect(first).toContain(
      "- `cleaning` [activity]: duration, performer (pencilled)",
    );
    const second = coverageOf(
      chat.commit([
        { op: "supersede", address: "n3", ...settled },
        {
          op: "note",
          about: ["cleaning"],
          content: "About three hours.",
          covers: ["quantities"],
          ...settled,
        },
      ]),
    );
    expect(second).toContain(
      "Every identity with a kind has what its kind needs.",
    );
  });

  test("a Note at inapplicable standing closes a need", () => {
    const chat = conversation();
    chat.commit([
      {
        op: "identify",
        identity: "curing",
        kind: "activity",
        covers: ["activities"],
        ...settled,
      },
    ]);
    const coverage = coverageOf(
      chat.commit([
        {
          op: "note",
          about: ["curing"],
          content: "Nobody performs curing; it only takes time.",
          covers: ["actors"],
          source: "person",
          standing: "inapplicable",
        },
      ]),
    );
    expect(coverage).toContain("- `curing` [activity]: duration");
    expect(coverage).not.toContain("performer");
  });

  test("placeholders are listed, and superseding keeps or replaces covers", () => {
    const chat = conversation();
    chat.commit([
      {
        op: "identify",
        identity: "demand",
        covers: ["activities"],
        ...inferred,
      },
      { op: "identify", identity: "crew", covers: ["goals"], ...inferred },
    ]);
    const coverage = coverageOf(
      chat.commit([
        {
          op: "supersede",
          address: "n1",
          content: "Daily orders.",
          ...settled,
        },
        { op: "supersede", address: "n2", covers: ["resources"], ...inferred },
      ]),
    );
    expect(coverage).toContain("- activities: 1 confirmed");
    expect(coverage).toContain("- goals: nothing recorded; nothing confirmed");
    expect(coverage).toContain("- resources: 1 placeholder; nothing confirmed");
    expect(coverage).toContain("- Placeholders: `crew`.");
  });

  test("the map renders coverage and each Note's covers", () => {
    const chat = conversation();
    chat.commit([
      {
        op: "identify",
        identity: "line-2",
        content: "The second line.",
        covers: ["resources"],
        ...settled,
      },
    ]);
    const markdown = mapOf(chat, {
      detail: "full",
      coverage: vocabulary,
    });
    expect(markdown).toContain("## Coverage");
    expect(markdown).toContain("- resources: 1 confirmed");
    expect(markdown).toContain("[n1 — person; settled; covers resources]");
  });
});

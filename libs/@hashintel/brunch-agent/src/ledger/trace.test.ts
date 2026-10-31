import { describe, expect, test } from "vitest";

import { petrinautContextualUserMessageBody } from "../petrinaut/contextual-user-message";
import { foldCommits } from "./commits";
import { traceLedger } from "./trace";

import type { LedgerState } from "./projection/records";

const ledger: LedgerState = {
  title: "Ledger",
  turns: [
    { id: "turn-1", excerpt: "Cases wait in one queue." },
    { id: "turn-2", excerpt: "Two clerks work the queue." },
    { id: "turn-3", excerpt: "Actually there are three clerks." },
    { id: "turn-4", excerpt: "Go ahead and build it." },
  ],
  entities: [
    {
      address: "e1",
      name: "The queue",
      kind: "location",
      origin: "stated",
      status: "confirmed",
      turn: "turn-1",
    },
    {
      address: "e2",
      name: "Clerks",
      kind: "resource",
      origin: "stated",
      status: "confirmed",
      turn: "turn-2",
    },
    {
      address: "e3",
      name: "Opening hours",
      kind: "horizon",
      origin: "stated",
      status: "confirmed",
      turn: "turn-2",
    },
  ],
  claims: [
    {
      address: "c1",
      text: "Cases wait in one queue, first come first served.",
      entities: ["e1"],
      origin: "stated",
      status: "confirmed",
      turn: "turn-1",
    },
    {
      address: "c2",
      text: "Two clerks work the queue.",
      entities: ["e2", "e1"],
      origin: "stated",
      status: "confirmed",
      turn: "turn-2",
    },
    {
      address: "c3",
      text: "Three clerks work the queue.",
      entities: ["e2", "e1"],
      origin: "stated",
      status: "confirmed",
      supersedes: ["c2"],
      turn: "turn-3",
    },
  ],
  obligations: [
    {
      address: "o1",
      text: "Check the clerk count against a run.",
      claims: ["c2"],
      turn: "turn-4",
    },
  ],
  reflections: [
    {
      address: "r1",
      text: "The Queue place holds waiting cases.",
      netElements: [{ kind: "place", id: "queue" }],
      claims: ["c1"],
      turn: "turn-4",
    },
    {
      address: "r2",
      text: "Clerks are tokens in the Clerks place; the run used two.",
      netElements: [
        { kind: "place", id: "clerks" },
        { kind: "transition", id: "serve" },
      ],
      discharges: ["o1"],
      turn: "turn-4",
    },
  ],
  comments: [],
};

const addresses = (records: readonly { address: string }[]) =>
  records.map(({ address }) => address);

describe("traceLedger", () => {
  test("walks from a net element to the reflections naming it and back to its turns", () => {
    const trace = traceLedger(ledger, {
      netElement: ({ kind, id }) => kind === "transition" && id === "serve",
    });
    expect(addresses(trace.reflections)).toEqual(["r2"]);
    expect(addresses(trace.obligations)).toEqual(["o1"]);
    expect(addresses(trace.claims)).toEqual(["c2"]);
    expect(addresses(trace.entities)).toEqual(["e1", "e2"]);
    expect(trace.turns.map(({ id }) => id)).toEqual([
      "turn-1",
      "turn-2",
      "turn-4",
    ]);
  });

  test("flags a traced claim a later claim replaced", () => {
    const trace = traceLedger(ledger, {
      netElement: ({ id }) => id === "clerks",
    });
    expect(trace.superseded).toEqual({ c2: "c3" });
  });

  test("names the claim that stands now for a claim replaced more than once", () => {
    const trace = traceLedger(
      {
        ...ledger,
        claims: [
          ...ledger.claims,
          {
            address: "c4",
            text: "Four clerks work the queue.",
            entities: ["e2", "e1"],
            origin: "stated",
            status: "confirmed",
            supersedes: ["c3"],
            turn: "turn-4",
          },
        ],
      },
      { netElement: ({ id }) => id === "clerks" },
    );
    expect(trace.superseded).toEqual({ c2: "c4" });
  });

  test("starts from record addresses without pulling in every claim about an entity", () => {
    const trace = traceLedger(ledger, { records: ["e2", "c1", "c9"] });
    expect(addresses(trace.claims)).toEqual(["c1"]);
    expect(addresses(trace.entities)).toEqual(["e1", "e2"]);
    expect(trace.reflections).toEqual([]);
    expect(trace.missing).toEqual(["c9"]);
  });

  test("traces nothing for a net element no reflection names", () => {
    const trace = traceLedger(ledger, { netElement: ({ id }) => id === "x" });
    expect(trace).toEqual({
      reflections: [],
      obligations: [],
      claims: [],
      entities: [],
      superseded: {},
      turns: [],
      missing: [],
    });
  });
});

describe("turn excerpts", () => {
  const commit = (toolCallId: string, entries: unknown[], ids: string[]) => ({
    id: `assistant-${toolCallId}`,
    role: "assistant" as const,
    parts: [
      {
        type: "dynamic-tool",
        toolName: "ledger_commit",
        toolCallId,
        state: "output-available",
        input: { entries },
        output: { status: "recorded", commitId: toolCallId, revision: 1, ids },
      },
    ],
  });
  const entity = [
    "entity/create",
    { name: "Queue", kind: "location", origin: "stated", status: "confirmed" },
  ];

  test("anchor each turn with the opening of the user's words", () => {
    const { state } = foldCommits({
      messages: [
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "Cases   wait\nin a queue." }],
        },
        commit("ledger-1", [entity], ["e1"]),
      ],
    });
    expect(state.turns).toEqual([
      { id: "user-1", excerpt: "Cases wait in a queue." },
    ]);
  });

  test("shorten a long message to a bounded excerpt", () => {
    const { state } = foldCommits({
      messages: [
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "word ".repeat(100) }],
        },
        commit("ledger-1", [entity], ["e1"]),
      ],
    });
    const excerpt = state.turns[0]?.excerpt ?? "";
    expect(Array.from(excerpt)).toHaveLength(240);
    expect(excerpt.endsWith("…")).toBe(true);
  });

  test("quote the user's words from a contextual message with submission context", () => {
    const { state } = foldCommits({
      messages: [
        {
          id: "user-1",
          role: "user",
          parts: [
            {
              type: "text",
              text: petrinautContextualUserMessageBody({
                userText: "Cases   wait\nin a queue.",
                diagnosticsContext: "",
                submissionContext: { interviewLength: "short" },
              }),
            },
          ],
        },
        commit("ledger-1", [entity], ["e1"]),
      ],
    });
    expect(state.turns).toEqual([
      { id: "user-1", excerpt: "Cases wait in a queue." },
    ]);
  });

  test("quote the user's words from a contextual message with diagnostics", () => {
    const { state } = foldCommits({
      messages: [
        {
          id: "user-1",
          role: "user",
          parts: [
            {
              type: "text",
              text: petrinautContextualUserMessageBody({
                userText: "Cases wait in a queue.",
                diagnosticsContext: "Place p1 has no arcs.",
              }),
            },
          ],
        },
        commit("ledger-1", [entity], ["e1"]),
      ],
    });
    expect(state.turns).toEqual([
      { id: "user-1", excerpt: "Cases wait in a queue." },
    ]);
  });
});

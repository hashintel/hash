import { describe, expect, test } from "vitest";

import { toPetrinautId } from "@hashintel/petrinaut-core";

import { foldCommits, type LedgerHistoryMessage } from "../ledger/commits";
import { traceLedger } from "../ledger/trace";
import {
  basisQueryTarget,
  basisTraceForModel,
  namesBasisQueryTarget,
} from "./basis-query-answer";
import { generatedArcId } from "./net-element-ids";

import type { BasisQuerySelector } from "../ledger/basis-query";
import type { NetStructure } from "./net-readers";

const queue = {
  id: "queue",
  name: "Queue",
  colorId: null,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
};
const definition = {
  places: [queue],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

/** A net view as a result records it, which may hold keys no current document has. */
const target = (view: unknown, selector: BasisQuerySelector) =>
  basisQueryTarget(view as NetStructure, selector);

describe("basisQueryTarget", () => {
  test("finds the one element its selector names, by name or ID", () => {
    expect(target(definition, { kind: "place", name: "Queue" })).toEqual(queue);
    expect(target(definition, { kind: "place", id: "queue" })).toEqual(queue);
    expect(
      target(definition, { kind: "place", name: "Missing" }),
    ).toBeUndefined();
    expect(target(definition, { kind: "transition", id: "queue" })).toBe(
      undefined,
    );
  });

  test("finds nothing when the selector names several elements", () => {
    const twoQueues = {
      ...definition,
      places: [queue, { ...queue, id: "queue-2" }],
    };
    expect(target(twoQueues, { kind: "place", name: "Queue" })).toBeUndefined();
  });

  test("matches an arc by its transition, direction and place, identified by Petrinaut's generated arc ID", () => {
    const withArc = {
      ...definition,
      places: [queue, { ...queue, id: "served", name: "Served" }],
      transitions: [
        {
          id: "serve",
          name: "Serve",
          inputArcs: [{ placeId: "queue", weight: 1, type: "standard" }],
          outputArcs: [{ placeId: "served", weight: 1 }],
          lambdaType: "predicate",
          lambdaCode: "",
          transitionKernelCode: "",
          x: 0,
          y: 0,
        },
      ],
    };
    const arc = target(withArc, {
      kind: "arc",
      transitionId: "serve",
      arcDirection: "input",
      placeId: "queue",
    });
    expect(arc).toEqual({
      arc: { transitionId: "serve", arcDirection: "input", placeId: "queue" },
      id: "$A_place:queue___serve",
      name: "Serve input",
    });
    expect(
      target(withArc, {
        kind: "arc",
        transitionId: "serve",
        arcDirection: "output",
        placeId: "served",
      })?.name,
    ).toBe("Serve output");
  });

  test("matches an arc written with the model's own IDs to the converted arc the document holds", () => {
    const withArc = {
      ...definition,
      transitions: [
        {
          id: toPetrinautId("serve"),
          name: "Serve",
          inputArcs: [
            { placeId: toPetrinautId("queue"), weight: 1, type: "standard" },
          ],
          outputArcs: [],
          lambdaType: "predicate",
          lambdaCode: "",
          transitionKernelCode: "",
          x: 0,
          y: 0,
        },
      ],
    };
    expect(
      target(withArc, {
        kind: "arc",
        transitionId: "serve",
        arcDirection: "input",
        placeId: "queue",
      })?.id,
    ).toBe(
      generatedArcId({
        transitionId: toPetrinautId("serve"),
        arcDirection: "input",
        placeId: toPetrinautId("queue"),
      }),
    );
  });

  test("finds an element inside a component", () => {
    const withComponent = {
      ...definition,
      components: [
        {
          id: "intake",
          name: "Intake",
          places: [{ ...queue, id: "triage", name: "Triage" }],
          transitions: [],
          types: [],
          parameters: [],
          differentialEquations: [],
        },
      ],
    };
    expect(target(withComponent, { kind: "place", name: "Triage" })?.id).toBe(
      "triage",
    );
  });

  test("finds a component and what is inside it in a view recorded with `subnets` and `subnetId`", () => {
    const instanceOf = (id: string, name: string, componentId: string) => ({
      id,
      name,
      subnetId: componentId,
      parameterValues: {},
      x: 0,
      y: 0,
    });
    const withOldKeys = {
      ...definition,
      componentInstances: [instanceOf("intake-1", "Intake1", "intake")],
      subnets: [
        {
          id: "intake",
          name: "Intake",
          places: [{ ...queue, id: "triage", name: "Triage" }],
          transitions: [],
          types: [],
          parameters: [],
          differentialEquations: [],
          componentInstances: [instanceOf("desk-1", "Desk1", "desk")],
        },
      ],
    };
    expect(target(withOldKeys, { kind: "component", name: "Intake" })?.id).toBe(
      "intake",
    );
    expect(target(withOldKeys, { kind: "place", name: "Triage" })?.id).toBe(
      "triage",
    );
    expect(
      target(withOldKeys, { kind: "componentInstance", name: "Desk1" })?.id,
    ).toBe("desk-1");
  });

  test("finds a fusion by its name or its ID, and never mistakes it for an arc", () => {
    const withFusions = {
      ...definition,
      fusions: [
        { id: "belt", name: "Belt", members: [] },
        { id: "spare", name: "Spare", members: [] },
      ],
    };
    expect(target(withFusions, { kind: "fusion", name: "Belt" })?.id).toBe(
      "belt",
    );
    expect(target(withFusions, { kind: "fusion", id: "spare" })?.id).toBe(
      "spare",
    );
  });
});

const user = (id: string, text: string): LedgerHistoryMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
});
const committed = (
  toolCallId: string,
  revision: number,
  entries: unknown[],
  ids: string[],
): LedgerHistoryMessage => ({
  id: toolCallId,
  role: "assistant",
  parts: [
    {
      type: "dynamic-tool",
      toolName: "ledger_commit",
      toolCallId,
      state: "output-available",
      input: { entries },
      output: { status: "recorded", commitId: toolCallId, revision, ids },
    },
  ],
});
const queueFacts = committed(
  "ledger-1",
  1,
  [
    [
      "entity/create",
      {
        name: "The queue",
        kind: "location",
        origin: "stated",
        status: "confirmed",
      },
    ],
    [
      "claim/create",
      {
        text: "Cases wait in a queue.",
        entities: ["$0"],
        origin: "stated",
        status: "confirmed",
      },
    ],
  ],
  ["e1", "c1"],
);
const reflection = (netElement: { kind: string; id: string }) =>
  committed(
    "ledger-2",
    2,
    [
      [
        "reflection/create",
        {
          text: "The Queue place holds waiting cases.",
          netElements: [netElement],
          claims: ["c1"],
        },
      ],
    ],
    ["r1"],
  );

const basis = (
  messages: LedgerHistoryMessage[],
  kind: BasisQuerySelector["kind"],
  element: { id: string },
) =>
  basisTraceForModel(
    traceLedger(foldCommits({ messages }).state, {
      netElement: namesBasisQueryTarget(kind, element),
    }),
  );

describe("basisTraceForModel", () => {
  test("returns the reflection naming an element, what it rests on, and its turns", () => {
    const laterClaim = committed(
      "ledger-3",
      3,
      [
        [
          "claim/create",
          {
            text: "The queue is first come, first served.",
            entities: ["e1"],
            origin: "stated",
            status: "confirmed",
          },
        ],
      ],
      ["c2"],
    );
    // A later claim about the same entity is not part of the basis.
    expect(
      basis(
        [
          user("user-1", "Cases wait in a queue."),
          queueFacts,
          reflection({ kind: "place", id: "queue" }),
          user("user-2", "It is first come, first served."),
          laterClaim,
        ],
        "place",
        queue,
      ),
    ).toEqual({
      reflections: [
        {
          id: "r1",
          text: "The Queue place holds waiting cases.",
          netElements: [{ kind: "place", id: "queue" }],
          claims: ["c1"],
          turn: "user-1",
        },
      ],
      obligations: [],
      claims: [
        {
          id: "c1",
          text: "Cases wait in a queue.",
          entities: ["e1"],
          origin: "stated",
          status: "confirmed",
          turn: "user-1",
        },
      ],
      entities: [
        {
          id: "e1",
          name: "The queue",
          kind: "location",
          origin: "stated",
          status: "confirmed",
          turn: "user-1",
        },
      ],
      superseded: {},
      turns: [{ id: "user-1", excerpt: "Cases wait in a queue." }],
    });
  });

  test("marks a claim the basis rests on that a later claim replaced", () => {
    const correction = committed(
      "ledger-3",
      3,
      [
        [
          "claim/create",
          {
            text: "Cases wait in two queues.",
            entities: ["e1"],
            origin: "stated",
            status: "confirmed",
            supersedes: ["c1"],
          },
        ],
      ],
      ["c2"],
    );
    expect(
      basis(
        [
          user("user-1", "Cases wait in a queue."),
          queueFacts,
          reflection({ kind: "place", id: "queue" }),
          user("user-2", "Actually, two queues."),
          correction,
        ],
        "place",
        queue,
      ).superseded,
    ).toEqual({ c1: "c2" });
  });

  test("a reflection names an arc by Petrinaut's generated arc ID", () => {
    expect(
      basis(
        [
          user("user-1", "Cases wait in a queue."),
          queueFacts,
          reflection({ kind: "arc", id: "$A_place:queue___serve" }),
        ],
        "arc",
        { id: "$A_place:queue___serve" },
      ).reflections.map(({ id }) => id),
    ).toEqual(["r1"]);
    // Only an address of the target's kind names it.
    expect(
      basis(
        [
          user("user-1", "Cases wait in a queue."),
          queueFacts,
          reflection({ kind: "place", id: "queue" }),
        ],
        "transition",
        queue,
      ).reflections,
    ).toEqual([]);
  });
});

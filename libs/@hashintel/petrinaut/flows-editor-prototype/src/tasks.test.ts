import { describe, expect, it } from "vitest";

import {
  START_ID,
  addStep,
  type EditorDocument,
  emptyDocument,
  fieldKey,
  updateStep,
} from "./document";
import { mockEntities, mockEntityTypes } from "./mock-graph";
import { findTask } from "./tasks";

const typeUrl = (title: string) =>
  mockEntityTypes.find((type) => type.title === title)!.baseUrl;
const propertyUrl = (type: string, title: string) =>
  mockEntityTypes
    .find((candidate) => candidate.title === type)!
    .properties.find((property) => property.title === title)!.baseUrl;
const person = (label: string) =>
  mockEntities.find((entity) => entity.label.startsWith(label))!.entityId;

const grade = (taskId: number, document: EditorDocument) =>
  findTask(taskId)!.grade(document);

/** Find suppliers, then a For each over them holding the given steps, then (optionally) an email. */
const perSupplier = (inside: string[], share = true) => {
  const find = addStep(emptyDocument(), "queryEntities", {
    after: { stepId: START_ID, port: "next" },
  });
  let document: EditorDocument = {
    ...find.document,
    queries: {
      [fieldKey(find.stepId, "query")]: {
        entityTypeBaseUrl: typeUrl("Supplier"),
        conditions: [],
      },
    },
  };
  const each = addStep(document, "forEach", {
    after: { stepId: find.stepId, port: "next" },
  });
  document = updateStep(each.document, each.stepId, (step) => ({
    ...step,
    over: { kind: "step-output", stepId: find.stepId, outputName: "entities" },
  }));
  for (const id of inside) {
    document = addStep(document, id, { parentId: each.stepId }).document;
  }
  if (share) {
    document = addStep(document, "sendEmail", {
      after: { stepId: each.stepId, port: "next" },
    }).document;
  }
  return document;
};

describe("task 2: monthly supplier summary", () => {
  it("passes For each + two Aggregates + a share", () => {
    expect(grade(2, perSupplier(["aggregate", "aggregate"]))).toBe("complete");
  });
  it("passes other per-supplier shapes: two Find entities counts", () => {
    expect(grade(2, perSupplier(["queryEntities", "queryEntities"]))).toBe(
      "complete",
    );
  });
  it("passes a Filter list plus an Aggregate", () => {
    expect(grade(2, perSupplier(["filterList", "aggregate"]))).toBe("complete");
  });
  it("is minor with one count, or two counts never shared", () => {
    expect(grade(2, perSupplier(["aggregate"]))).toBe("minor");
    expect(grade(2, perSupplier(["aggregate", "aggregate"], false))).toBe(
      "minor",
    );
  });
  it("is major when counts are monthly totals, fail with no count", () => {
    const totals = addStep(emptyDocument(), "aggregate", {
      after: { stepId: START_ID, port: "next" },
    }).document;
    expect(grade(2, totals)).toBe("major");
    expect(grade(2, emptyDocument())).toBe("fail");
  });
});

/** Find purity checks, an If on "Passed is true", and an email on the given port to the given person. */
const flagFlow = (port: "true" | "false", recipient: string | null) => {
  const find = addStep(emptyDocument(), "queryEntities", {
    after: { stepId: START_ID, port: "next" },
  });
  const gate = addStep(find.document, "if", {
    after: { stepId: find.stepId, port: "next" },
  });
  const email = addStep(gate.document, "sendEmail", {
    after: { stepId: gate.stepId, port },
  });
  return {
    ...email.document,
    queries: {
      [fieldKey(find.stepId, "query")]: {
        entityTypeBaseUrl: typeUrl("Purity check"),
        conditions: [],
      },
      [fieldKey(gate.stepId, "condition")]: {
        conditions: [
          {
            id: 1,
            propertyBaseUrl: propertyUrl("Purity check", "Passed"),
            operator: "equals" as const,
            value: "true",
          },
        ],
      },
    },
    lists: recipient
      ? {
          [fieldKey(email.stepId, "to")]: [
            {
              kind: "constant" as const,
              payload: { kind: "EntityId" as const, value: person(recipient) },
            },
          ],
        }
      : {},
  } as EditorDocument;
};

describe("task 1: flag a bad batch", () => {
  it("is complete when the failed side emails the quality lead", () => {
    expect(grade(1, flagFlow("false", "Maya Patel"))).toBe("complete");
  });
  it("is major when the email goes to someone else or no one", () => {
    expect(grade(1, flagFlow("false", "Tom Okafor"))).toBe("major");
    expect(grade(1, flagFlow("false", null))).toBe("major");
  });
  it("is major when it fires on passed checks", () => {
    expect(grade(1, flagFlow("true", "Maya Patel"))).toBe("major");
  });
  it("is complete when a trigger's condition picks failed checks and the email goes to her address", () => {
    const email = addStep(emptyDocument(), "sendEmail", {
      after: { stepId: START_ID, port: "next" },
    });
    const document = {
      ...email.document,
      triggers: [
        {
          id: "created",
          kind: "entityCreated" as const,
          description: "",
          settings: { entityTypeBaseUrl: typeUrl("Purity check") },
        },
      ],
      wires: [
        ...email.document.wires,
        {
          id: "created->start",
          source: "created",
          sourcePort: "next",
          target: START_ID,
        },
      ],
      queries: {
        [fieldKey("created", "condition")]: {
          conditions: [
            {
              id: 1,
              propertyBaseUrl: propertyUrl("Purity check", "Passed"),
              operator: "equals" as const,
              value: "false",
            },
          ],
        },
      },
      lists: {
        [fieldKey(email.stepId, "to")]: [
          {
            kind: "constant" as const,
            payload: { kind: "Text" as const, value: "maya@example.com" },
          },
        ],
      },
    } as EditorDocument;
    expect(grade(1, document)).toBe("complete");
  });
});

import { describe, expect, it } from "vitest";

import {
  formatPayloadPath,
  payloadKindSchemas,
  validatePayloadValue,
} from "./payload-schemas.js";
import { allPayloadKinds } from "./types.js";

import type {
  PayloadKind,
  PayloadKindValues,
  ProposedEntity,
  StoredItemRef,
  StoredObjectRef,
} from "./types.js";
import type { EntityId, VersionedUrl } from "@blockprotocol/type-system";

const entityId =
  "d4e16033-c281-4cde-aa35-9085bf2e7579~0f5f3bd1-3a28-4b9f-9e3a-5b4a6b1c2d3e" as EntityId;

const entityTypeId =
  "https://hash.ai/@h/types/entity-type/person/v/1" as VersionedUrl;

const nameProperty = "https://hash.ai/@h/types/property-type/name/";

const proposedEntity = {
  claims: { isSubjectOf: [], isObjectOf: [] },
  provenance: { actorType: "ai", origin: { type: "flow" } },
  propertyMetadata: { value: {} },
  localEntityId: entityId,
  entityTypeIds: [entityTypeId],
  properties: { [nameProperty]: "Alice" },
} as unknown as ProposedEntity;

const validValues: { [Kind in PayloadKind]: PayloadKindValues[Kind] } = {
  ActorType: "machine",
  Aggregation: {
    operation: "sum",
    subject: { kind: "field", path: ["score"], payloadKind: "Number" },
  },
  Boolean: false,
  Date: "2026-02-28",
  DateTime: "2026-10-16T16:00:00+02:00",
  Duration: { amount: 2, unit: "hours" },
  EntityId: entityId,
  EntityQuery: {
    filter: { all: [] },
    includeDrafts: false,
    limit: 10,
  },
  FailedEntityProposal: {
    proposedEntity,
    message: "The entity type doesn't exist",
  },
  FilterCondition: {
    kind: "all",
    conditions: [
      {
        kind: "condition",
        subject: { kind: "input", payloadKind: "Text" },
        operator: "contains",
        value: { kind: "Text", value: "a" },
      },
      {
        kind: "not",
        condition: {
          kind: "any",
          conditions: [
            {
              kind: "condition",
              subject: { kind: "entityType" },
              operator: "isOfType",
              value: { kind: "VersionedUrl", value: entityTypeId },
              includeSubtypes: true,
            },
          ],
        },
      },
    ],
  },
  FormattedText: { content: "# Title", format: "Markdown" },
  GoogleAccountId: "account-1",
  GoogleSheet: { newSheetName: "Results" },
  Number: -1.5,
  PersistedEntityMetadata: { entityId, operation: "create" },
  PropertyObjectWithMetadata: {
    value: {
      [nameProperty]: { value: "Alice", metadata: { dataTypeId: null } },
    },
  } as unknown as PayloadKindValues["PropertyObjectWithMetadata"],
  PropertyPatch: {
    op: "remove",
    path: [nameProperty],
  } as PayloadKindValues["PropertyPatch"],
  ProposedEntity: proposedEntity,
  ProposedEntityWithResolvedLinks: {
    ...proposedEntity,
    linkData: { leftEntityId: entityId, rightEntityId: entityId },
  },
  SortKey: {
    subject: { kind: "input", payloadKind: "Date" },
    direction: "descending",
  },
  Text: "",
  VersionedUrl: entityTypeId,
  WebPage: {
    url: "https://example.com" as PayloadKindValues["WebPage"]["url"],
    title: "Example",
    htmlContent: "<p>Hi</p>",
    innerText: "Hi",
  },
  WebSearchResult: {
    url: "https://example.com" as PayloadKindValues["WebPage"]["url"],
    title: "Example",
  },
};

describe("payloadKindSchemas", () => {
  it.each(allPayloadKinds)("accepts a valid %s", (kind) => {
    expect(payloadKindSchemas[kind].safeParse(validValues[kind]).error).toBe(
      undefined,
    );
  });

  it.each<[PayloadKind, unknown, string]>([
    ["ActorType", "robot", ""],
    ["Aggregation", { operation: "median" }, "operation"],
    ["Boolean", "true", ""],
    ["Date", "2026-02-30", ""],
    ["DateTime", "2026-10-16T14:00:00", ""],
    ["Duration", { amount: 1, unit: "months" }, "unit"],
    ["Duration", { amount: Number.POSITIVE_INFINITY, unit: "days" }, "amount"],
    ["EntityId", "not-an-entity-id", ""],
    ["EntityQuery", { filter: { all: [] }, limit: -1 }, "limit"],
    ["EntityQuery", { limit: 1 }, "filter"],
    [
      "FailedEntityProposal",
      {
        proposedEntity: { ...proposedEntity, localEntityId: "x" },
        message: "",
      },
      "proposedEntity.localEntityId",
    ],
    [
      "FilterCondition",
      {
        kind: "all",
        conditions: [
          {
            kind: "not",
            condition: {
              kind: "condition",
              subject: { kind: "input", payloadKind: "Colour" },
              operator: "equals",
            },
          },
        ],
      },
      "conditions[0].condition.subject.payloadKind",
    ],
    ["FilterCondition", { kind: "all", conditions: [] }, "conditions"],
    ["FilterCondition", validValues.FilterCondition.conditions[0], "kind"],
    ["FormattedText", { content: "a", format: "PDF" }, "format"],
    ["GoogleAccountId", 1, ""],
    ["GoogleSheet", { spreadsheetName: "a" }, ""],
    ["GoogleSheet", { newSheetName: "Results", spreadsheetId: 123 }, ""],
    ["GoogleSheet", { spreadsheetId: "abc", newSheetName: 123 }, ""],
    ["Number", Number.NaN, ""],
    ["PersistedEntityMetadata", { entityId, operation: "delete" }, "operation"],
    [
      "PropertyObjectWithMetadata",
      { value: { [nameProperty]: "Alice" } },
      `value["${nameProperty}"]`,
    ],
    ["PropertyPatch", { op: "add", path: [nameProperty] }, "property"],
    ["PropertyPatch", { op: "move", path: [] }, "op"],
    [
      "ProposedEntity",
      { ...proposedEntity, entityTypeIds: [] },
      "entityTypeIds",
    ],
    [
      "ProposedEntity",
      { ...proposedEntity, entityTypeIds: [entityTypeId, "person"] },
      "entityTypeIds[1]",
    ],
    [
      "ProposedEntityWithResolvedLinks",
      { ...proposedEntity, linkData: { leftEntityId: entityId } },
      "linkData.rightEntityId",
    ],
    [
      "SortKey",
      { subject: { kind: "entityType" }, direction: "ascending" },
      "subject.kind",
    ],
    ["Text", null, ""],
    ["VersionedUrl", "https://hash.ai/@h/types/entity-type/person/", ""],
    [
      "WebPage",
      { url: "https://example.com", title: "Example" },
      "htmlContent",
    ],
    ["WebSearchResult", ["https://example.com"], ""],
  ])("rejects an invalid %s, at %j", (kind, value, path) => {
    expect(
      validatePayloadValue({
        kind,
        array: false,
        value,
        allowStoredRefs: false,
      }),
    ).toEqual({ path, message: expect.any(String) as string });
  });

  it("accepts fields a kind doesn't define, as the web search API's position", () => {
    expect(
      validatePayloadValue({
        kind: "WebSearchResult",
        array: true,
        value: [{ ...validValues.WebSearchResult, position: 1 }],
        allowStoredRefs: false,
      }),
    ).toBe(undefined);
  });
});

describe("payload problem messages", () => {
  it.each<[PayloadKind, unknown, string]>([
    ["Text", 3, "Invalid input: expected string, received number"],
    [
      "GoogleSheet",
      { spreadsheetName: "a" },
      "Expected either a spreadsheetId or a newSheetName",
    ],
    [
      "PropertyPatch",
      { op: "move", path: [] },
      "Invalid discriminator value. Expected 'add' | 'replace' | 'remove'",
    ],
    ["EntityId", "web~entity", "Expected an entity id"],
  ])("explains an invalid %s", (kind, value, message) => {
    expect(
      validatePayloadValue({
        kind,
        array: false,
        value,
        allowStoredRefs: false,
      })?.message,
    ).toBe(message);
  });
});

describe("formatPayloadPath", () => {
  it("formats indexes, identifiers and other keys", () => {
    expect(formatPayloadPath([2, "properties", nameProperty, 0])).toBe(
      `[2].properties["${nameProperty}"][0]`,
    );
    expect(formatPayloadPath(["linkData", "leftEntityId"])).toBe(
      "linkData.leftEntityId",
    );
    expect(formatPayloadPath([])).toBe("");
  });
});

describe("validatePayloadValue", () => {
  const storedArray: StoredObjectRef<"ProposedEntity", true> = {
    __stored: true,
    kind: "ProposedEntity",
    storageKey: "flows/run/outputs/step-1",
    array: true,
    length: 3,
  };

  const storedItem: StoredItemRef<"ProposedEntity"> = {
    __stored: true,
    kind: "ProposedEntity",
    array: false,
    of: storedArray,
    index: 1,
  };

  it("checks every item of an array, reporting the first problem with its index", () => {
    expect(
      validatePayloadValue({
        kind: "PersistedEntityMetadata",
        array: true,
        value: [
          { entityId, operation: "create" },
          { entityId: "web~entity", operation: "update" },
          { entityId, operation: "nope" },
        ],
        allowStoredRefs: false,
      }),
    ).toEqual({ path: "[1].entityId", message: "Expected an entity id" });
  });

  it("requires an array value exactly when the payload is an array", () => {
    expect(
      validatePayloadValue({
        kind: "Text",
        array: true,
        value: "a",
        allowStoredRefs: false,
      }),
    ).toEqual({ path: "", message: "Expected an array" });

    expect(
      validatePayloadValue({
        kind: "Text",
        array: false,
        value: ["a"],
        allowStoredRefs: false,
      }),
    ).toEqual({
      path: "",
      message: expect.stringContaining("expected string") as string,
    });

    expect(
      validatePayloadValue({
        kind: "Text",
        array: true,
        value: [],
        allowStoredRefs: false,
      }),
    ).toBe(undefined);
  });

  it("rejects stored references unless they are allowed", () => {
    for (const [array, value] of [
      [true, storedArray],
      [false, storedItem],
      [true, [storedItem]],
    ] as const) {
      expect(
        validatePayloadValue({
          kind: "ProposedEntity",
          array,
          value,
          allowStoredRefs: false,
        }),
      ).toEqual({
        path: Array.isArray(value) ? "[0]" : "",
        message:
          "A stored payload reference can only be created by a flow's own steps",
      });
    }
  });

  it("accepts a stored reference of the right kind and arity where allowed", () => {
    for (const [array, value] of [
      [true, storedArray],
      [false, storedItem],
      [true, [storedItem, proposedEntity]],
    ] as const) {
      expect(
        validatePayloadValue({
          kind: "ProposedEntity",
          array,
          value,
          allowStoredRefs: true,
        }),
      ).toBe(undefined);
    }
  });

  it("still checks an inline value of a stored kind in full where references are allowed", () => {
    expect(
      validatePayloadValue({
        kind: "ProposedEntity",
        array: true,
        value: [proposedEntity, { ...proposedEntity, properties: [] }],
        allowStoredRefs: true,
      }),
    ).toEqual({
      path: "[1].properties",
      message: expect.any(String) as string,
    });
  });

  it("rejects a stored reference of another kind, arity, or of a kind that's never stored", () => {
    expect(
      validatePayloadValue({
        kind: "ProposedEntityWithResolvedLinks",
        array: true,
        value: storedArray,
        allowStoredRefs: true,
      }),
    ).toEqual({
      path: "",
      message:
        "Expected a stored ProposedEntityWithResolvedLinks reference, but it is of kind ProposedEntity",
    });

    expect(
      validatePayloadValue({
        kind: "ProposedEntity",
        array: false,
        value: storedArray,
        allowStoredRefs: true,
      }),
    ).toEqual({
      path: "",
      message:
        "Expected a reference to a single stored value, but it is to an array",
    });

    expect(
      validatePayloadValue({
        kind: "ProposedEntity",
        array: true,
        value: storedItem,
        allowStoredRefs: true,
      }),
    ).toEqual({
      path: "",
      message:
        "Expected a reference to a stored array, but it is to a single value",
    });

    expect(
      validatePayloadValue({
        kind: "ProposedEntity",
        array: true,
        value: [storedArray],
        allowStoredRefs: true,
      }),
    ).toEqual({
      path: "[0]",
      message:
        "Expected a reference to a single stored value, but it is to an array",
    });

    expect(
      validatePayloadValue({
        kind: "Text",
        array: true,
        value: { ...storedArray, kind: "Text" },
        allowStoredRefs: true,
      }),
    ).toEqual({
      path: "",
      message:
        "Text values are never stored, so can't be a stored payload reference",
    });
  });
});

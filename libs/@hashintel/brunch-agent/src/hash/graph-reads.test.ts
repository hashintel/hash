import { expect, test } from "vitest";

import {
  hashEntityReadMaxLimit,
  hashEntityReadMaxTraversalDepth,
  parseHashEntityCountInput,
  parseHashEntityReadInput,
  parseHashEntityTypeReadInput,
  parseHashWebReadInput,
} from "./graph-reads";

test("an entity read follows whole numbers of links, from none up to the maximum", () => {
  for (const traversalDepth of [0, hashEntityReadMaxTraversalDepth])
    expect(parseHashEntityReadInput({ traversalDepth })).toEqual({
      traversalDepth,
    });
  for (const traversalDepth of [-1, hashEntityReadMaxTraversalDepth + 1])
    expect(() => parseHashEntityReadInput({ traversalDepth })).toThrow(
      /Invalid value/u,
    );
  expect(() => parseHashEntityReadInput({ traversalDepth: 1.5 })).toThrow(
    /Invalid integer/u,
  );
});

test.each([
  ["entity read", parseHashEntityReadInput, { webIds: ["web"] }, "webIds"],
  ["entity count", parseHashEntityCountInput, { webIds: ["web"] }, "webIds"],
  [
    "entity type read",
    parseHashEntityTypeReadInput,
    { entityTypeIds: ["https://hash.ai/@h/types/entity-type/user/v/7"] },
    "entityTypeIds",
  ],
] as const)(
  "an %s takes lists of ids, and refuses an empty list, an empty id or a key it doesn't define",
  (_read, parse, valid, listKey) => {
    expect(parse(valid)).toEqual(valid);
    expect(() => parse({ [listKey]: [] })).toThrow(/Invalid length/u);
    expect(() => parse({ [listKey]: [""] })).toThrow(/Invalid length/u);
    expect(() => parse({ ...valid, unknown: true })).toThrow(/Invalid key/u);
  },
);

test("an entity read names values to show by entity id, or by entity id and a path into one", () => {
  const entityId = "web~entity";
  const byPath = { entityId, path: ["definition_object", "places", "0"] };
  expect(
    parseHashEntityReadInput({ fullValuesFor: [entityId, byPath] }),
  ).toEqual({ fullValuesFor: [entityId, byPath] });
  for (const entry of [
    { entityId, path: [] },
    { entityId, path: [""] },
    { entityId },
    { entityId: "", path: ["title"] },
    { entityId, path: ["title"], extra: true },
    "",
  ])
    expect(() => parseHashEntityReadInput({ fullValuesFor: [entry] })).toThrow(
      /Invalid/u,
    );
  expect(() => parseHashEntityReadInput({ fullValuesFor: [] })).toThrow(
    /Invalid length/u,
  );
});

test("an entity read pages by a limit of 1 to the maximum and an opaque cursor", () => {
  for (const limit of [1, hashEntityReadMaxLimit])
    expect(parseHashEntityReadInput({ limit, cursor: "next" })).toEqual({
      limit,
      cursor: "next",
    });
  const limitMessage =
    "limit is how many matched entities one page holds: a whole number from 1 to 1,000. Omit it for 100.";
  for (const limit of [0, hashEntityReadMaxLimit + 1, 2.5, "10"])
    expect(() => parseHashEntityReadInput({ limit })).toThrow(limitMessage);
  expect(() => parseHashEntityReadInput({ cursor: "" })).toThrow(
    /Invalid length/u,
  );
  expect(() => parseHashEntityReadInput({ cursor: ["a"] })).toThrow(
    /Invalid type/u,
  );
});

test("a web read takes no input", () => {
  expect(parseHashWebReadInput({})).toEqual({});
  expect(() => parseHashWebReadInput({ webIds: ["web"] })).toThrow(
    /Invalid key/u,
  );
});

test("an entity count takes entity types by title or by versioned entityTypeId, in given webs or none", () => {
  const typed = {
    entityTypes: [
      "Sales Order",
      "https://hash.ai/@acme/types/entity-type/sales-order/v/12",
    ],
  };
  expect(parseHashEntityCountInput(typed)).toEqual(typed);
  expect(parseHashEntityCountInput({})).toEqual({});
  expect(() => parseHashEntityCountInput({ entityTypes: [] })).toThrow(
    /Invalid length/u,
  );
  expect(() => parseHashEntityCountInput({ entityTypes: [""] })).toThrow(
    /Invalid length/u,
  );
  expect(() => parseHashEntityCountInput({ traversalDepth: 0 })).toThrow(
    /Invalid key/u,
  );
});

test.each([
  "https://hash.ai/@acme/types/entity-type/sales-order/",
  "https://hash.ai/@acme/types/entity-type/sales-order/v/0",
  "http://localhost:3000/@acme/types/entity-type/sales-order",
])(
  "an entity count refuses the unversioned type URL %s, telling the model what to give instead",
  (entityType) => {
    expect(() =>
      parseHashEntityCountInput({ entityTypes: [entityType] }),
    ).toThrow(
      "An entity type URL needs its version, as in …/sales-order/v/1: copy the entityTypeId from a read, or give the type's title instead.",
    );
  },
);

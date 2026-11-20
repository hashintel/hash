import { expect, test } from "vitest";

import {
  hashEntityReadMaxTraversalDepth,
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

test("a web read takes no input", () => {
  expect(parseHashWebReadInput({})).toEqual({});
  expect(() => parseHashWebReadInput({ webIds: ["web"] })).toThrow(
    /Invalid key/u,
  );
});

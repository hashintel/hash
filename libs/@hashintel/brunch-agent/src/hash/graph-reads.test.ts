import { expect, test } from "vitest";

import {
  hashEntityReadMaxLimit,
  hashEntityReadMaxTraversalDepth,
  hashPropertyBaseUrl,
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

const orderNumber =
  "https://hash.ai/@h/types/property-type/sales-order-number/";
const propertySelectorMessage =
  "A property is named by its base URL, ending in /, as in https://hash.ai/@h/types/property-type/name/, or by its versioned propertyTypeId, as in …/property-type/name/v/1: copy one from an entity read's properties legend. A short name such as name holds within one read only, so it isn't accepted.";

test.each([
  ["entity read", parseHashEntityReadInput],
  ["entity count", parseHashEntityCountInput],
] as const)(
  "an %s matches property values by base URL or versioned propertyTypeId, with a string, number or boolean",
  (_read, parse) => {
    const propertyEquals = [
      { property: orderNumber, value: "1000000283" },
      { property: `${orderNumber}v/2`, value: 283 },
      {
        property: "http://localhost:3000/@a/types/property-type/paid/",
        value: false,
      },
    ];
    expect(parse({ propertyEquals })).toEqual({ propertyEquals });
    expect(() => parse({ propertyEquals: [] })).toThrow(/Invalid length/u);
    for (const value of [null, ["1"], { amount: 1 }])
      expect(() =>
        parse({ propertyEquals: [{ property: orderNumber, value }] }),
      ).toThrow(
        "value is the property's value to match exactly: a string, number or boolean, in the type the read showed it (a quoted value is a string, a bare one a number).",
      );
    expect(() =>
      parse({
        propertyEquals: [{ property: orderNumber, value: "1", extra: true }],
      }),
    ).toThrow(/Invalid key/u);
  },
);

test.each([
  "sales_order_number",
  "Sales Order Number",
  "https://hash.ai/@h/types/property-type/sales-order-number",
  "https://hash.ai/@h/types/property-type/sales-order-number/v/0",
  "",
])(
  "a property named %j, neither a base URL nor a versioned id, is refused with what to give instead",
  (property) => {
    expect(() =>
      parseHashEntityReadInput({ propertyEquals: [{ property, value: "1" }] }),
    ).toThrow(propertySelectorMessage);
    expect(() =>
      parseHashEntityCountInput({ propertyEquals: [{ property, value: "1" }] }),
    ).toThrow(propertySelectorMessage);
    expect(() => parseHashEntityReadInput({ properties: [property] })).toThrow(
      propertySelectorMessage,
    );
  },
);

test("an entity read chooses properties to show by base URL or versioned propertyTypeId; a count shows none", () => {
  const properties = [orderNumber, `${orderNumber}v/1`];
  expect(parseHashEntityReadInput({ properties })).toEqual({ properties });
  expect(() => parseHashEntityReadInput({ properties: [] })).toThrow(
    /Invalid length/u,
  );
  expect(() => parseHashEntityCountInput({ properties })).toThrow(
    /Invalid key/u,
  );
});

test("a versioned propertyTypeId reduces to its base URL; a base URL is its own", () => {
  expect(hashPropertyBaseUrl(`${orderNumber}v/12`)).toBe(orderNumber);
  expect(hashPropertyBaseUrl(orderNumber)).toBe(orderNumber);
});

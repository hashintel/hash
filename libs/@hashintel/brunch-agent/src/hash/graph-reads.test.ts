import * as v from "valibot";
import { expect, test } from "vitest";

import {
  hashEntityCountDefaultExamples,
  hashEntityCountDefaultGroups,
  hashEntityCountDefaultJoinEntities,
  hashEntityCountGroupByPath,
  hashEntityCountJoinResultSchema,
  hashEntityCountMaxExamples,
  hashEntityCountMaxGroups,
  hashEntityCountMaxJoinEntities,
  hashEntityCountResultSchema,
  hashEntityCountWhereConditions,
  hashEntityReadDefaultLimit,
  hashEntityReadMaxLimit,
  hashEntityReadMaxTraversalDepth,
  hashEntityReadOversizedSchema,
  hashEntityTypeReadDefaultLimit,
  hashEntityTypeReadResultSchema,
  hashPropertyBaseUrl,
  hashReadDefaultMaxTokens,
  hashReadMaxMaxTokens,
  hashReadMinMaxTokens,
  parseHashEntityCountInput,
  parseHashEntityReadInput,
  parseHashEntityTypeReadInput,
  parseHashWebReadInput,
} from "./graph-reads";

test("an entity read follows whole numbers of links, from none up to the maximum, with an actionable error", () => {
  for (const traversalDepth of [0, hashEntityReadMaxTraversalDepth])
    expect(parseHashEntityReadInput({ traversalDepth })).toEqual({
      traversalDepth,
    });
  for (const traversalDepth of [-1, hashEntityReadMaxTraversalDepth + 1, 1.5])
    expect(() => parseHashEntityReadInput({ traversalDepth })).toThrow(
      /traversalDepth.*0 to 3.*entityIds/u,
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
  [
    "entity type read by titles",
    parseHashEntityTypeReadInput,
    { titles: ["Sales Order"] },
    "titles",
  ],
] as const)(
  "an %s takes lists of ids, and refuses an empty list with guidance, an empty entry or a key it doesn't define",
  (_read, parse, valid, listKey) => {
    expect(parse(valid)).toEqual(valid);
    expect(() => parse({ [listKey]: [] })).toThrow(/omit it instead/u);
    expect(() => parse({ [listKey]: [""] })).toThrow(/non-empty|base URL/u);
    expect(() => parse({ ...valid, unknown: true })).toThrow(/Invalid key/u);
  },
);

test("an entity read accepts entityTypes by title, base URL or published versioned URL, and rejects draft or malformed type URLs", () => {
  const valid = {
    entityTypes: [
      "Sales Order",
      "https://hash.ai/@acme/types/entity-type/sales-order/",
      "https://hash.ai/@acme/types/entity-type/sales-order/v/12",
    ],
  };
  expect(parseHashEntityReadInput(valid)).toEqual(valid);
  for (const bad of [
    "https://hash.ai/@acme/types/entity-type/sales-order/v/0",
    "https://hash.ai/@acme/types/entity-type/sales-order/v/2-draft.lane.5",
    "http://localhost:3000/@acme/types/entity-type/sales-order",
  ]) {
    expect(() => parseHashEntityReadInput({ entityTypes: [bad] })).toThrow(
      /base URL ending in \/.*published versioned URL/u,
    );
  }
});

test("an entity read names values to show by entity id, or by entity id and path with optional offset and limit", () => {
  const entityId = "web~entity";
  const byPath = { entityId, path: ["definition_object", "places", "0"] };
  const byPagedPath = {
    entityId,
    path: ["notes"],
    offset: 0,
    limit: 4000,
  };
  expect(
    parseHashEntityReadInput({
      fullValuesFor: [entityId, byPath, byPagedPath],
    }),
  ).toEqual({ fullValuesFor: [entityId, byPath, byPagedPath] });
  for (const entry of [
    { entityId, path: [] },
    { entityId, path: [""] },
    { entityId },
    { entityId: "", path: ["title"] },
    { entityId, path: ["title"], offset: -1 },
    { entityId, path: ["title"], offset: 1.5 },
    { entityId, path: ["title"], limit: 0 },
    { entityId, path: ["title"], limit: 1.5 },
    { entityId, path: ["title"], extra: true },
    "",
  ])
    expect(() => parseHashEntityReadInput({ fullValuesFor: [entry] })).toThrow(
      /Invalid|offset|limit|at least one step/u,
    );
  expect(() => parseHashEntityReadInput({ fullValuesFor: [] })).toThrow(
    /omit it instead/u,
  );
});

test("an entity read pages by a limit of 1 to the maximum, optional includeArchived, maxTokens, and an opaque cursor", () => {
  for (const limit of [1, hashEntityReadMaxLimit])
    expect(
      parseHashEntityReadInput({
        limit,
        cursor: "next",
        includeArchived: true,
        maxTokens: hashReadMaxMaxTokens,
      }),
    ).toEqual({
      limit,
      cursor: "next",
      includeArchived: true,
      maxTokens: hashReadMaxMaxTokens,
    });
  for (const limit of [0, hashEntityReadMaxLimit + 1, 2.5, "10"])
    expect(() => parseHashEntityReadInput({ limit })).toThrow(
      new RegExp(
        `limit.*1 to 1,000.*Omit it for ${hashEntityReadDefaultLimit}`,
        "u",
      ),
    );
  expect(() => parseHashEntityReadInput({ cursor: "" })).toThrow(
    /Invalid length/u,
  );
  expect(() => parseHashEntityReadInput({ cursor: ["a"] })).toThrow(
    /Invalid type/u,
  );
});

test("entity type reads accept base URLs, published versioned URLs, titles, pagination and maxTokens", () => {
  const valid = {
    entityTypeIds: [
      "https://hash.ai/@h/types/entity-type/user/",
      "https://hash.ai/@h/types/entity-type/user/v/7",
    ],
    titles: ["User"],
    limit: hashEntityTypeReadDefaultLimit,
    cursor: "https://hash.ai/@h/types/entity-type/user/v/7",
    maxTokens: hashReadDefaultMaxTokens,
  };
  expect(parseHashEntityTypeReadInput(valid)).toEqual(valid);
  for (const bad of [
    "User",
    "https://hash.ai/@h/types/entity-type/user/v/0",
    "https://hash.ai/@h/types/entity-type/user/v/2-draft.lane.1",
  ]) {
    expect(() =>
      parseHashEntityTypeReadInput({ entityTypeIds: [bad] }),
    ).toThrow(/base URL ending in \/.*published versioned URL.*titles/u);
  }
  for (const limit of [0, hashEntityReadMaxLimit + 1, 1.5])
    expect(() => parseHashEntityTypeReadInput({ limit })).toThrow(
      new RegExp(
        `limit.*1 to 1,000.*Omit it for ${hashEntityTypeReadDefaultLimit}`,
        "u",
      ),
    );
  const result = {
    entityTypes: [
      {
        entityTypeId: "https://hash.ai/@h/types/entity-type/user/v/7",
        title: "User",
        properties: [
          {
            baseUrl: "https://hash.ai/@h/types/property-type/name/",
            title: "Name",
            description: "Full display name.",
          },
        ],
        links: [],
      },
    ],
    cursor: "https://hash.ai/@h/types/entity-type/user/v/7",
  };
  expect(v.parse(hashEntityTypeReadResultSchema, result)).toEqual(result);
});

test.each([
  ["entity read", parseHashEntityReadInput],
  ["entity type read", parseHashEntityTypeReadInput],
  ["entity count", parseHashEntityCountInput],
] as const)(
  "a %s accepts maxTokens between min and max and rejects out-of-range values with defaults named",
  (_read, parse) => {
    for (const maxTokens of [hashReadMinMaxTokens, hashReadMaxMaxTokens])
      expect(parse({ maxTokens })).toEqual({ maxTokens });
    for (const maxTokens of [
      hashReadMinMaxTokens - 1,
      hashReadMaxMaxTokens + 1,
      10_000.5,
      "20000",
    ])
      expect(() => parse({ maxTokens })).toThrow(
        /maxTokens.*1,000 to 60,000.*Omit it for 20,000/u,
      );
  },
);

test("a web read takes no input", () => {
  expect(parseHashWebReadInput({})).toEqual({});
  expect(() => parseHashWebReadInput({ webIds: ["web"] })).toThrow(
    /Invalid key/u,
  );
});

test("an entity count takes entity types by title, base URL or published versioned URL, plus changeable defaults", () => {
  const typed = {
    entityTypes: [
      "Sales Order",
      "https://hash.ai/@acme/types/entity-type/sales-order/",
      "https://hash.ai/@acme/types/entity-type/sales-order/v/12",
    ],
    includeDrafts: true,
    includeArchived: true,
    maxGroups: hashEntityCountMaxGroups,
    maxExamples: hashEntityCountMaxExamples,
    maxJoinEntities: hashEntityCountMaxJoinEntities,
  };
  expect(parseHashEntityCountInput(typed)).toEqual(typed);
  expect(parseHashEntityCountInput({ maxExamples: 0 })).toEqual({
    maxExamples: 0,
  });
  expect(parseHashEntityCountInput({})).toEqual({});
  expect(() => parseHashEntityCountInput({ entityTypes: [] })).toThrow(
    /omit it instead/u,
  );
  expect(() => parseHashEntityCountInput({ entityTypes: [""] })).toThrow(
    /non-empty/u,
  );
  expect(() => parseHashEntityCountInput({ traversalDepth: 0 })).toThrow(
    /Invalid key/u,
  );
  for (const maxGroups of [0, hashEntityCountMaxGroups + 1, 2.5])
    expect(() => parseHashEntityCountInput({ maxGroups })).toThrow(
      new RegExp(
        `maxGroups.*1 to ${hashEntityCountMaxGroups}.*Omit it for ${hashEntityCountDefaultGroups}`,
        "u",
      ),
    );
  for (const maxExamples of [-1, hashEntityCountMaxExamples + 1, 1.5])
    expect(() => parseHashEntityCountInput({ maxExamples })).toThrow(
      new RegExp(
        `maxExamples.*0 to ${hashEntityCountMaxExamples}.*Omit it for ${hashEntityCountDefaultExamples}`,
        "u",
      ),
    );
  for (const maxJoinEntities of [0, hashEntityCountMaxJoinEntities + 1, 1.5])
    expect(() => parseHashEntityCountInput({ maxJoinEntities })).toThrow(
      new RegExp(
        `maxJoinEntities.*1 to ${hashEntityCountMaxJoinEntities.toLocaleString("en-US")}.*Omit it for ${hashEntityCountDefaultJoinEntities.toLocaleString("en-US")}`,
        "u",
      ),
    );
});

test.each([
  "https://hash.ai/@acme/types/entity-type/sales-order/v/0",
  "https://hash.ai/@acme/types/entity-type/sales-order/v/2-draft.lane.5",
  "http://localhost:3000/@acme/types/entity-type/sales-order",
])(
  "an entity count refuses the invalid or draft type URL %s, telling the model what to give instead",
  (entityType) => {
    expect(() =>
      parseHashEntityCountInput({ entityTypes: [entityType] }),
    ).toThrow(/base URL ending in \/.*published versioned URL/u);
  },
);

const orderNumber =
  "https://hash.ai/@h/types/property-type/sales-order-number/";
const propertySelectorMessage =
  "A property is named by its base URL, ending in /, as in https://hash.ai/@h/types/property-type/name/, or by its versioned propertyTypeId, as in …/property-type/name/v/1: copy one from an entity read's properties legend or an entity type read. A short name such as name holds within one read only, so it isn't accepted.";

test.each([
  ["entity read", parseHashEntityReadInput],
  ["entity count", parseHashEntityCountInput],
] as const)(
  "an %s matches property values by base URL, published versioned URL or draft versioned URL, with a string, number or boolean",
  (_read, parse) => {
    const propertyEquals = [
      { property: orderNumber, value: "1000000283" },
      { property: `${orderNumber}v/2`, value: 283 },
      { property: `${orderNumber}v/2-draft.lane123.5`, value: "draft-ok" },
      {
        property: "http://localhost:3000/@a/types/property-type/paid/",
        value: false,
      },
    ];
    expect(parse({ propertyEquals })).toEqual({ propertyEquals });
    expect(() => parse({ propertyEquals: [] })).toThrow(/omit it instead/u);
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
  "https://hash.ai/@h/types/property-type/sales-order-number/v/0-draft.lane.1",
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
  const properties = [
    orderNumber,
    `${orderNumber}v/1`,
    `${orderNumber}v/2-draft.lane.3`,
  ];
  expect(parseHashEntityReadInput({ properties })).toEqual({ properties });
  expect(() => parseHashEntityReadInput({ properties: [] })).toThrow(
    /omit it instead/u,
  );
  expect(() => parseHashEntityCountInput({ properties })).toThrow(
    /Invalid key/u,
  );
});

test("a published or draft versioned propertyTypeId reduces to its base URL; a base URL is its own", () => {
  expect(hashPropertyBaseUrl(`${orderNumber}v/12`)).toBe(orderNumber);
  expect(hashPropertyBaseUrl(`${orderNumber}v/2-draft.lane.5`)).toBe(
    orderNumber,
  );
  expect(hashPropertyBaseUrl(orderNumber)).toBe(orderNumber);
});

const hasLineItem = {
  linkType: "Has Line Item",
  direction: "outgoing",
} as const;
const fulfilledBy = { linkType: "Fulfills", direction: "incoming" } as const;
const hasCustomer = {
  linkType: "Has Customer",
  direction: "outgoing",
} as const;

test("a count by links supports arbitrary-length where paths, multiple where conditions, multi-hop groupBy, base-URL linkTypes, and optional entityTypes", () => {
  const multiCondition = {
    entityTypes: ["Sales Order"],
    where: [
      { path: [hasLineItem], exists: true },
      { path: [hasLineItem, fulfilledBy, hasCustomer], exists: false },
    ],
    groupBy: {
      path: [
        {
          linkType: "https://hash.ai/@acme/types/entity-type/has-line-item/",
          direction: "outgoing" as const,
        },
        hasCustomer,
      ],
    },
  };
  expect(parseHashEntityCountInput(multiCondition)).toEqual(multiCondition);
  expect(hashEntityCountWhereConditions(multiCondition.where)).toEqual(
    multiCondition.where,
  );
  expect(hashEntityCountGroupByPath(multiCondition.groupBy)).toEqual(
    multiCondition.groupBy.path,
  );

  const singleWhereAndStep = {
    where: { path: [hasCustomer], exists: true },
    groupBy: hasCustomer,
  };
  expect(parseHashEntityCountInput(singleWhereAndStep)).toEqual(
    singleWhereAndStep,
  );
  expect(hashEntityCountWhereConditions(singleWhereAndStep.where)).toEqual([
    singleWhereAndStep.where,
  ]);
  expect(hashEntityCountGroupByPath(singleWhereAndStep.groupBy)).toEqual([
    hasCustomer,
  ]);
});

test("a count by links refuses empty where/groupBy paths or lists", () => {
  expect(() =>
    parseHashEntityCountInput({
      where: { path: [], exists: true },
    }),
  ).toThrow(/at least one link step/u);
  expect(() =>
    parseHashEntityCountInput({
      where: [],
    }),
  ).toThrow(/omit it instead/u);
  expect(() =>
    parseHashEntityCountInput({
      groupBy: { path: [] },
    }),
  ).toThrow(/at least one link step/u);
});

test("a count by links refuses an unknown direction or draft link type URL", () => {
  expect(() =>
    parseHashEntityCountInput({
      groupBy: { linkType: "Has Customer", direction: "both" },
    }),
  ).toThrow(/Invalid/u);
  expect(() =>
    parseHashEntityCountInput({
      groupBy: {
        linkType:
          "https://hash.ai/@acme/types/entity-type/has-customer/v/2-draft.lane.1",
        direction: "outgoing",
      },
    }),
  ).toThrow(/base URL ending in \/.*published versioned URL/u);
  expect(() =>
    parseHashEntityCountInput({
      groupBy: { ...hasCustomer, depth: 1 },
    }),
  ).toThrow(/Invalid/u);
});

test("a count by links settles as counted, refused or incomplete, without webScope on refused/incomplete", () => {
  const reads = [
    { role: "counted", entityTypes: ["Sales Order"], entities: 3 },
    { role: "link", entityTypes: ["Has Customer"], entities: 4 },
  ];
  const counted = {
    outcome: "counted",
    webScope: "default",
    ofType: 3,
    count: 2,
    groups: [
      {
        entity: { entityId: "w~c1", label: "Acme", external: true },
        count: 2,
      },
      { count: 1 },
    ],
    otherGroups: { groups: 2, count: 2 },
    examples: [{ entityId: "w~o1" }],
    reads,
    requests: 4,
  };
  expect(v.parse(hashEntityCountJoinResultSchema, counted)).toEqual(counted);
  const refused = {
    outcome: "refused",
    reads,
    requests: 2,
  };
  expect(v.parse(hashEntityCountJoinResultSchema, refused)).toEqual(refused);
  const incomplete = {
    outcome: "incomplete",
    reason: "Reading Has Customer links failed on page 2.",
    reads,
    requests: 3,
  };
  expect(v.parse(hashEntityCountJoinResultSchema, incomplete)).toEqual(
    incomplete,
  );
  // A plain count is not a count by links, and the other way round.
  const plain = { count: 1, webScope: "default", entityTypes: [], webs: [] };
  expect(v.safeParse(hashEntityCountJoinResultSchema, plain).success).toBe(
    false,
  );
  expect(v.safeParse(hashEntityCountResultSchema, counted).success).toBe(false);
});

test("browser oversized entity-read refusal schema validates payload metadata", () => {
  const oversized = {
    refused: true as const,
    payloadBytes: 14_000_000,
    matched: 100,
    linked: 420,
  };
  expect(v.parse(hashEntityReadOversizedSchema, oversized)).toEqual(oversized);
});

import { describe, expect, test, vi } from "vitest";

import {
  hashEntityCountDefaultJoinEntities,
  hashEntityCountMaxJoinLinkTypes,
  hashEntityCountMaxJoinRequests,
  hashEntityReadMaxLimit,
} from "./graph-reads";
import {
  type HashJoinEntity,
  type HashJoinGraph,
  type HashJoinSelector,
  hashEntityCountJoinConcurrency,
  hashEntityJoinCount,
  hashEntityJoinCountPlan,
  runHashEntityJoinCount,
} from "./join-count";

const hasLineItem = {
  linkType: "Has Line Item",
  direction: "outgoing",
} as const;
const fulfilledBy = { linkType: "Fulfills", direction: "incoming" } as const;
const hasCustomer = {
  linkType: "Has Customer",
  direction: "outgoing",
} as const;
const inRegion = { linkType: "In Region", direction: "outgoing" } as const;
const undelivered = {
  path: [hasLineItem, fulfilledBy],
  exists: false,
};

const record = (entityId: string, label?: string): HashJoinEntity => ({
  entityId,
  ...(label === undefined ? {} : { label }),
});
const link = (
  entityId: string,
  left: string,
  right: string,
): HashJoinEntity => ({
  entityId,
  linkData: { leftEntityId: left, rightEntityId: right },
});

/**
 * Three sales orders: o1's line items none fulfilled, o2's some, o3's all.
 * o1 has customer c1, o2 has c1 and c2, o3 none.
 */
const orders = [
  record("o1", "SO-1"),
  record("o2", "SO-2"),
  record("o3", "SO-3"),
];
const lineItems = [
  link("li1", "o1", "i1"),
  link("li2", "o1", "i2"),
  link("li3", "o2", "i3"),
  link("li4", "o2", "i4"),
  link("li5", "o3", "i5"),
  link("li6", "o3", "i6"),
];
const fulfills = [
  link("f1", "d1", "i3"),
  link("f2", "d2", "i5"),
  link("f3", "d3", "i6"),
];
const customers = [
  link("hc1", "o1", "c1"),
  link("hc2", "o2", "c1"),
  link("hc3", "o2", "c2"),
];
const regions = [link("ir1", "c1", "r-eu"), link("ir2", "c2", "r-us")];
const links = new Map([
  ["Has Line Item", lineItems],
  ["Fulfills", fulfills],
  ["Has Customer", customers],
  ["In Region", regions],
]);

describe("the join", () => {
  const joinComplete = (...args: Parameters<typeof hashEntityJoinCount>) => {
    const result = hashEntityJoinCount(...args);
    if ("reason" in result) {
      throw new Error(`Unexpected work budget stop: ${result.reason}`);
    }
    return result;
  };

  test("counts only the order none of whose line items is fulfilled under exists false, and the others under exists true", () => {
    const none = joinComplete({ where: undelivered }, orders, links);
    expect(none.ofType).toBe(3);
    expect(none.count).toBe(1);
    expect(none.examples.map(({ entityId }) => entityId)).toEqual(["o1"]);
    const some = joinComplete(
      { where: { ...undelivered, exists: true } },
      orders,
      links,
    );
    expect(some.count).toBe(2);
    expect(some.examples.map(({ entityId }) => entityId)).toEqual(["o2", "o3"]);
  });

  test("applies multiple where conditions with AND semantics and supports 3-hop paths", () => {
    // Orders that have a customer AND are fulfilled (only o2; o3 has no customer, o1 is unfulfilled).
    const fulfilledWithCustomer = joinComplete(
      {
        where: [
          { path: [hasCustomer], exists: true },
          { ...undelivered, exists: true },
        ],
      },
      orders,
      links,
    );
    expect(fulfilledWithCustomer.count).toBe(1);
    expect(
      fulfilledWithCustomer.examples.map(({ entityId }) => entityId),
    ).toEqual(["o2"]);

    // 3-hop path: order -> line item <- delivery -> ... (reusing existing links)
    const deliveredTo = new Map([
      ...links,
      ["Delivered From", [link("df1", "d2", "w1")]],
    ]);
    const threeHop = joinComplete(
      {
        where: {
          path: [
            hasLineItem,
            fulfilledBy,
            { linkType: "Delivered From", direction: "outgoing" },
          ],
          exists: true,
        },
      },
      orders,
      deliveredTo,
    );
    expect(threeHop.count).toBe(1);
    expect(threeHop.examples.map(({ entityId }) => entityId)).toEqual(["o3"]);
  });

  test("groups by one step or a multi-hop path, under each reached entity and under none for none", () => {
    expect(
      joinComplete({ groupBy: hasCustomer }, orders, links).groups,
    ).toEqual(
      new Map([
        ["c1", 2],
        ["c2", 1],
        [null, 1],
      ]),
    );
    expect(
      joinComplete({ where: undelivered, groupBy: hasCustomer }, orders, links)
        .groups,
    ).toEqual(new Map([["c1", 1]]));
    expect(
      joinComplete(
        { groupBy: { path: [hasCustomer, inRegion] } },
        orders,
        links,
      ).groups,
    ).toEqual(
      new Map([
        ["r-eu", 2],
        ["r-us", 1],
        [null, 1],
      ]),
    );
  });

  test("follows links literally by direction, and a link reaches its other end whether or not it was read", () => {
    const incoming = joinComplete(
      {
        where: {
          path: [{ ...hasCustomer, direction: "incoming" }],
          exists: true,
        },
      },
      [...orders, record("c1")],
      links,
    );
    expect(incoming.examples.map(({ entityId }) => entityId)).toEqual(["c1"]);
    const reachesUnread = joinComplete(
      { where: { path: [hasCustomer], exists: true } },
      orders,
      links,
    );
    expect(reachesUnread.count).toBe(2);
  });

  test("honors default and custom maxExamples, including 0", () => {
    const many = Array.from({ length: 5 }, (_, index) => record(`o${index}`));
    expect(
      joinComplete({ groupBy: hasCustomer }, many, links).examples,
    ).toHaveLength(3);
    expect(
      joinComplete({ groupBy: hasCustomer, maxExamples: 0 }, many, links)
        .examples,
    ).toHaveLength(0);
    expect(
      joinComplete({ groupBy: hasCustomer, maxExamples: 5 }, many, links)
        .examples,
    ).toHaveLength(5);
  });

  test("evaluates hub-shaped incoming->outgoing where and groupBy in linear time without O(N*M) expansion", () => {
    const leafCount = 9_000;
    const leaves = Array.from({ length: leafCount }, (_, index) =>
      record(`leaf-${index}`),
    );
    const hubLinks = Array.from({ length: leafCount }, (_, index) =>
      link(`hl-${index}`, "hub", `leaf-${index}`),
    );
    const hubLinkMap = new Map([["Hub Link", hubLinks]]);
    const incomingThenOutgoing = [
      { linkType: "Hub Link", direction: "incoming" as const },
      { linkType: "Hub Link", direction: "outgoing" as const },
    ];

    const start = performance.now();
    const joined = hashEntityJoinCount(
      {
        where: { path: incomingThenOutgoing, exists: true },
        groupBy: { path: incomingThenOutgoing },
      },
      leaves,
      hubLinkMap,
    );
    const elapsedMs = performance.now() - start;

    expect("reason" in joined).toBe(false);
    if ("reason" in joined) {
      return;
    }
    expect(joined.count).toBe(leafCount);
    expect(joined.groups?.size).toBe(leafCount);
    expect(joined.groups?.get("leaf-0")).toBe(leafCount);
    expect(joined.groups?.get(`leaf-${leafCount - 1}`)).toBe(leafCount);
    expect(elapsedMs).toBeLessThan(500);
  });

  test("deduplicates overlapping multi-branch diamond groupBy paths and stops cleanly when expansion work exceeds budget or is aborted", () => {
    // Each order o0..o4 reaches BOTH h1 and h2; both h1 and h2 reach t1 and t2.
    const diamondOrders = Array.from({ length: 5 }, (_, index) =>
      record(`o${index}`),
    );
    const diamondLinks = new Map([
      [
        "To Hub",
        diamondOrders.flatMap(({ entityId }) => [
          link(`th-${entityId}-1`, entityId, "h1"),
          link(`th-${entityId}-2`, entityId, "h2"),
        ]),
      ],
      [
        "To Target",
        [
          link("tt-1-1", "h1", "t1"),
          link("tt-1-2", "h1", "t2"),
          link("tt-2-1", "h2", "t1"),
          link("tt-2-2", "h2", "t2"),
        ],
      ],
    ]);
    const diamondGroupBy = {
      path: [
        { linkType: "To Hub", direction: "outgoing" as const },
        { linkType: "To Target", direction: "outgoing" as const },
      ],
    };

    const exact = hashEntityJoinCount(
      { groupBy: diamondGroupBy },
      diamondOrders,
      diamondLinks,
    );
    expect("reason" in exact ? exact.reason : exact.groups).toEqual(
      new Map([
        ["t1", 5],
        ["t2", 5],
      ]),
    );

    const stopped = hashEntityJoinCount(
      { groupBy: diamondGroupBy },
      diamondOrders,
      diamondLinks,
      { maxExpansionSteps: 5 },
    );
    expect("reason" in stopped ? stopped.reason : "").toContain(
      "expansion limit",
    );

    const controller = new AbortController();
    controller.abort(new Error("cancelled join"));
    expect(() =>
      hashEntityJoinCount(
        { groupBy: diamondGroupBy },
        diamondOrders,
        diamondLinks,
        { signal: controller.signal },
      ),
    ).toThrow("cancelled join");
  });

  test("with drafts, counts an entity with live and draft editions once, as its draft, matching links on the live id", () => {
    // w~o1 is live with a draft edition; its only line item is fulfilled.
    // w~o2 is draft-only; its line item, linked from the live id, is not.
    const draftOrders = [
      record("w~o1", "SO-1"),
      record("w~o1~d1", "SO-1 (draft)"),
      record("w~o2~d2", "SO-2 (draft)"),
    ];
    const draftLinks = new Map([
      [
        "Has Line Item",
        [link("w~li1", "w~o1", "w~i1"), link("w~li2", "w~o2", "w~i2")],
      ],
      ["Fulfills", [link("w~f1", "w~d", "w~i1")]],
    ]);

    const undeliveredDrafts = joinComplete(
      { where: undelivered },
      draftOrders,
      draftLinks,
    );
    expect(undeliveredDrafts.ofType).toBe(2);
    expect(undeliveredDrafts.count).toBe(1);
    expect(undeliveredDrafts.examples).toEqual([
      record("w~o2~d2", "SO-2 (draft)"),
    ]);

    const onlyLive = joinComplete(
      { where: undelivered },
      draftOrders.slice(0, 2),
      draftLinks,
    );
    expect(onlyLive.ofType).toBe(1);
    expect(onlyLive.count).toBe(0);

    const delivered = joinComplete(
      { where: { ...undelivered, exists: true } },
      draftOrders,
      draftLinks,
    );
    expect(delivered.count).toBe(1);
    expect(delivered.examples).toEqual([record("w~o1~d1", "SO-1 (draft)")]);

    // Several drafts of one entity still count once, choosing one stably.
    const twoDrafts = joinComplete(
      {},
      [record("w~o3~db"), record("w~o3"), record("w~o3~da")],
      new Map(),
    );
    expect(twoDrafts.ofType).toBe(1);
    expect(twoDrafts.examples).toEqual([record("w~o3~da")]);
  });

  test("with drafts, joins multi-hop where and groupBy across draft endpoints, a draft link superseding its live edition", () => {
    const draftOrders = [record("w~o1~d1"), record("w~o2"), record("w~o3")];
    const draftLinks = new Map([
      [
        "Has Customer",
        [
          // The live link to c1 is superseded by its draft, to c2.
          link("w~hc1", "w~o1", "w~c1"),
          link("w~hc1~dl", "w~o1", "w~c2"),
          link("w~hc2", "w~o2", "w~c1~dc"),
          link("w~hc3", "w~o3", "w~c1"),
        ],
      ],
      [
        "In Region",
        [
          // A draft customer's link reaches the region from its draft id.
          link("w~ir1", "w~c1~dc", "w~r-eu"),
          link("w~ir2", "w~c2", "w~r-us"),
        ],
      ],
    ]);

    const byCustomer = joinComplete(
      { groupBy: hasCustomer },
      draftOrders,
      draftLinks,
    );
    expect(byCustomer.groups).toEqual(
      new Map([
        ["w~c1", 2],
        ["w~c2", 1],
      ]),
    );

    const byRegion = joinComplete(
      { groupBy: { path: [hasCustomer, inRegion] } },
      draftOrders,
      draftLinks,
    );
    expect(byRegion.groups).toEqual(
      new Map([
        ["w~r-eu", 2],
        ["w~r-us", 1],
      ]),
    );

    const inEu = joinComplete(
      {
        where: {
          path: [hasCustomer, inRegion, { ...inRegion, direction: "incoming" }],
          exists: true,
        },
      },
      [...draftOrders, record("w~o4")],
      draftLinks,
    );
    expect(inEu.count).toBe(3);
    expect(inEu.examples.map(({ entityId }) => entityId)).toEqual([
      "w~o1~d1",
      "w~o2",
      "w~o3",
    ]);
  });

  test("plans counted selector, distinct links, and safe single-direction step-0 endpoint anchors", () => {
    const propertyEquals = [
      {
        property: "https://hash.ai/@h/types/property-type/status/",
        value: "open",
      },
    ];
    expect(
      hashEntityJoinCountPlan({
        entityTypes: ["Sales Order"],
        propertyEquals,
        where: { path: [hasLineItem, fulfilledBy], exists: false },
        groupBy: hasCustomer,
      }),
    ).toEqual({
      counted: { entityTypes: ["Sales Order"], propertyEquals },
      links: [
        {
          linkType: "Has Line Item",
          endpointAnchor: {
            endpoint: "leftEntity",
            entityTypes: ["Sales Order"],
          },
        },
        { linkType: "Fulfills" },
        {
          linkType: "Has Customer",
          endpointAnchor: {
            endpoint: "leftEntity",
            entityTypes: ["Sales Order"],
          },
        },
      ],
    });

    // A link type used at both step 0 and step 1, or in both directions at step 0, is NOT anchored.
    const selfRel = { linkType: "Related", direction: "outgoing" } as const;
    expect(
      hashEntityJoinCountPlan({
        entityTypes: ["Sales Order"],
        where: [
          { path: [selfRel, selfRel], exists: true },
          {
            path: [{ linkType: "Mutual", direction: "outgoing" }],
            exists: true,
          },
          {
            path: [{ linkType: "Mutual", direction: "incoming" }],
            exists: true,
          },
        ],
      }).links,
    ).toEqual([{ linkType: "Related" }, { linkType: "Mutual" }]);

    // Untyped join counts omit entityTypes and never anchor links.
    expect(
      hashEntityJoinCountPlan({
        where: { path: [hasCustomer], exists: true },
      }),
    ).toEqual({
      counted: {},
      links: [{ linkType: "Has Customer" }],
    });
  });
});

/**
 * A graph over `data`, keyed by the first type selector, `"*"` (untyped), or
 * `"ids"`, whose pages hold at most `pageSize` and give an opaque string cursor.
 */
const fakeGraph = (
  data: ReadonlyMap<string, readonly HashJoinEntity[]>,
  {
    pageSize = 2,
    sizes,
    failOn,
    cursorWhenFull = false,
  }: {
    pageSize?: number;
    sizes?: (key: string) => number;
    failOn?: { key: string; page: number };
    cursorWhenFull?: boolean;
  } = {},
) => {
  const all = [...data.values()].flat();
  const keyOf = (selector: HashJoinSelector) =>
    "entityIds" in selector ? "ids" : (selector.entityTypes?.[0] ?? "*");
  const pagesOf = new Map<string, number>();
  const graph = {
    size: vi.fn<HashJoinGraph<string>["size"]>((selector) =>
      Promise.resolve(
        sizes?.(keyOf(selector)) ?? data.get(keyOf(selector))?.length ?? 0,
      ),
    ),
    page: vi.fn<HashJoinGraph<string>["page"]>((selector, limit, cursor) => {
      const key = keyOf(selector);
      const page = (pagesOf.get(key) ?? 0) + 1;
      pagesOf.set(key, page);
      if (failOn?.key === key && failOn.page === page) {
        return Promise.reject(new Error("HASH didn't respond in time."));
      }
      const matches =
        "entityIds" in selector
          ? // By id, as with drafts: an id matches its draft editions too.
            all.filter(({ entityId }) =>
              selector.entityIds.includes(
                entityId.split("~").slice(0, 2).join("~"),
              ),
            )
          : (data.get(key) ?? []);
      const start = cursor === undefined ? 0 : Number(cursor);
      const end = start + Math.min(limit, pageSize);
      const entities = matches.slice(start, end);
      const more = cursorWhenFull
        ? entities.length === Math.min(limit, pageSize)
        : end < matches.length;
      return Promise.resolve({
        entities,
        ...(more ? { cursor: String(end) } : {}),
      });
    }),
  };
  return graph;
};

const signal = new AbortController().signal;
const salesOrders = { entityTypes: ["Sales Order"] };
const data = new Map([
  ["Sales Order", orders],
  ["Has Line Item", lineItems],
  ["Fulfills", fulfills],
  ["Has Customer", customers],
  ["Customer", [record("c1", "Acme"), record("c2", "Globex")]],
]);

describe("the paged read", () => {
  test("reads every page of each type until no cursor, joins across page boundaries, and labels groups by id", async () => {
    const graph = fakeGraph(data);
    const result = await runHashEntityJoinCount(
      {
        ...salesOrders,
        where: { ...undelivered, exists: true },
        groupBy: hasCustomer,
      },
      "default",
      graph,
      signal,
    );
    expect(result).toEqual({
      outcome: "counted",
      webScope: "default",
      ofType: 3,
      count: 2,
      groups: [
        { entity: { entityId: "c1", label: "Acme" }, count: 1 },
        { entity: { entityId: "c2", label: "Globex" }, count: 1 },
        { count: 1 },
      ],
      examples: [
        { entityId: "o2", label: "SO-2" },
        { entityId: "o3", label: "SO-3" },
      ],
      reads: [
        { role: "counted", entityTypes: ["Sales Order"], entities: 3 },
        { role: "link", entityTypes: ["Has Line Item"], entities: 6 },
        { role: "link", entityTypes: ["Fulfills"], entities: 3 },
        { role: "link", entityTypes: ["Has Customer"], entities: 3 },
        { role: "grouped", entityTypes: [], entities: 2 },
      ],
      requests: 14,
    });
    for (const [, limit] of graph.page.mock.calls) {
      expect(limit).toBe(hashEntityReadMaxLimit);
    }
    expect(
      graph.page.mock.calls
        .filter(
          ([selector]) =>
            "entityTypes" in selector &&
            selector.entityTypes?.[0] === "Has Line Item",
        )
        .map(([, , cursor]) => cursor),
    ).toEqual([undefined, "2", "4"]);
    expect(graph.page).toHaveBeenCalledWith(
      { entityIds: ["c1", "c2"] },
      hashEntityReadMaxLimit,
      undefined,
      signal,
    );
  });

  test("slices top maxGroups deterministically by entityId BEFORE fetching labels, issuing at most 1 lookup of <= maxGroups IDs", async () => {
    // 50 distinct groups: c00 has 3 orders, c01..c49 have 1 order each.
    const manyOrders = [
      record("o-a"),
      record("o-b"),
      record("o-c"),
      ...Array.from({ length: 49 }, (_, index) => record(`o-${index + 1}`)),
    ];
    const customerLinks = [
      link("hc-a", "o-a", "c00"),
      link("hc-b", "o-b", "c00"),
      link("hc-c", "o-c", "c00"),
      ...Array.from({ length: 49 }, (_, index) =>
        link(
          `hc-${index + 1}`,
          `o-${index + 1}`,
          `c${String(index + 1).padStart(2, "0")}`,
        ),
      ),
    ];
    const allCustomers = Array.from({ length: 50 }, (_, index) => {
      const id = `c${String(index).padStart(2, "0")}`;
      return record(id, `Customer ${id}`);
    });
    const graph = fakeGraph(
      new Map([
        ["Sales Order", manyOrders],
        ["Has Customer", customerLinks],
        ["Customer", allCustomers],
      ]),
      { pageSize: 1000 },
    );

    const result = await runHashEntityJoinCount(
      { ...salesOrders, groupBy: hasCustomer },
      "named",
      graph,
      signal,
    );
    expect(result.outcome).toBe("counted");
    if (result.outcome !== "counted") {
      return;
    }
    expect(result.groups).toHaveLength(25);
    expect(result.groups?.[0]).toEqual({
      entity: { entityId: "c00", label: "Customer c00" },
      count: 3,
    });
    expect(result.otherGroups).toEqual({ groups: 25, count: 25 });

    // Exactly ONE label lookup, containing only the top 25 IDs (c00..c24), never c25..c49.
    const idLookups = graph.page.mock.calls.filter(
      ([selector]) => "entityIds" in selector,
    );
    expect(idLookups).toHaveLength(1);
    const firstLookup = idLookups[0]?.[0];
    const requestedIds =
      firstLookup !== undefined && "entityIds" in firstLookup
        ? firstLookup.entityIds
        : [];
    expect(requestedIds).toHaveLength(25);
    expect(requestedIds[0]).toBe("c00");
    expect(requestedIds[24]).toBe("c24");
  });

  test("honors custom maxGroups, custom maxExamples, custom maxJoinEntities, and untyped joins", async () => {
    const graph = fakeGraph(
      new Map([
        ["*", orders],
        ["Has Customer", customers],
        ["Customer", [record("c1", "Acme"), record("c2", "Globex")]],
      ]),
      { pageSize: 1000 },
    );
    const result = await runHashEntityJoinCount(
      {
        groupBy: hasCustomer,
        maxGroups: 1,
        maxExamples: 0,
        maxJoinEntities: 50_000,
      },
      "default",
      graph,
      signal,
    );
    expect(result).toMatchObject({
      outcome: "counted",
      ofType: 3,
      count: 3,
      groups: [{ entity: { entityId: "c1", label: "Acme" }, count: 2 }],
      otherGroups: { groups: 2, count: 2 },
      examples: [],
      reads: [
        { role: "counted", entityTypes: [], entities: 3 },
        { role: "link", entityTypes: ["Has Customer"], entities: 3 },
        { role: "grouped", entityTypes: [], entities: 1 },
      ],
    });
  });

  test("names an unread grouped entity and refuses before reading when counted + links exceed effective maxJoinEntities", async () => {
    const graph = fakeGraph(data, {
      sizes: (key) =>
        key === "Sales Order" ? hashEntityCountDefaultJoinEntities - 10 : 6,
    });
    await expect(
      runHashEntityJoinCount(
        { ...salesOrders, where: undelivered },
        "default",
        graph,
        signal,
      ),
    ).resolves.toEqual({
      outcome: "refused",
      reads: [
        {
          role: "counted",
          entityTypes: ["Sales Order"],
          entities: hashEntityCountDefaultJoinEntities - 10,
        },
        { role: "link", entityTypes: ["Has Line Item"], entities: 6 },
        { role: "link", entityTypes: ["Fulfills"], entities: 6 },
      ],
      requests: 3,
    });
    expect(graph.page).not.toHaveBeenCalled();

    // Unreadable group id marks unread: true.
    const unreadGraph = fakeGraph(
      new Map([
        ["Sales Order", [record("o1")]],
        ["Has Customer", [link("hc1", "o1", "hidden-c")]],
      ]),
      { pageSize: 1000 },
    );
    const unreadResult = await runHashEntityJoinCount(
      { ...salesOrders, groupBy: hasCustomer },
      "default",
      unreadGraph,
      signal,
    );
    expect(unreadResult).toMatchObject({
      outcome: "counted",
      groups: [{ entity: { entityId: "hidden-c" }, unread: true, count: 1 }],
    });
  });

  test("completes a count just under the budget, with full pages read in parallel and an empty last page", async () => {
    const many = (count: number, make: (index: number) => HashJoinEntity) =>
      Array.from({ length: count }, (_, index) => make(index));
    const graph = fakeGraph(
      new Map([
        ["Sales Order", many(9000, (index) => record(`o${index}`))],
        [
          "Has Line Item",
          many(9500, (index) =>
            link(`li${index}`, `o${index % 9000}`, `i${index}`),
          ),
        ],
        [
          "Fulfills",
          many(1200, (index) => link(`f${index}`, `d${index}`, `i${index}`)),
        ],
      ]),
      { pageSize: hashEntityReadMaxLimit, cursorWhenFull: true },
    );
    const result = await runHashEntityJoinCount(
      { ...salesOrders, where: undelivered },
      "default",
      graph,
      signal,
    );
    expect(result).toMatchObject({
      outcome: "counted",
      ofType: 9000,
      count: 9000 - 1200,
      reads: [
        { role: "counted", entityTypes: ["Sales Order"], entities: 9000 },
        { role: "link", entityTypes: ["Has Line Item"], entities: 9500 },
        { role: "link", entityTypes: ["Fulfills"], entities: 1200 },
      ],
      requests: 25,
    });
  });

  test("labelling only the top 25 groups keeps a near-20,000-entity count with 9,500 groups to 1 label lookup", async () => {
    const many = (count: number, make: (index: number) => HashJoinEntity) =>
      Array.from({ length: count }, (_, index) => make(index));
    const graph = fakeGraph(
      new Map([
        ["Sales Order", many(9500, (index) => record(`o${index}`))],
        [
          "Has Customer",
          many(9500, (index) => link(`hc${index}`, `o${index}`, `c${index}`)),
        ],
        ["Customer", many(9500, (index) => record(`c${index}`, `C${index}`))],
      ]),
      { pageSize: hashEntityReadMaxLimit },
    );
    const result = await runHashEntityJoinCount(
      { ...salesOrders, groupBy: hasCustomer },
      "default",
      graph,
      signal,
    );
    expect(result).toMatchObject({
      outcome: "counted",
      ofType: 9500,
      count: 9500,
      otherGroups: { groups: 9500 - 25, count: 9500 - 25 },
    });
    const idLookups = graph.page.mock.calls.filter(
      ([selector]) => "entityIds" in selector,
    );
    expect(idLookups).toHaveLength(1);
    const firstLookup = idLookups[0]?.[0];
    expect(
      firstLookup !== undefined && "entityIds" in firstLookup
        ? firstLookup.entityIds
        : [],
    ).toHaveLength(25);
  });

  test("reads that grow past effective maxJoinEntities part-way stop within a page each, incomplete, with no count", async () => {
    const graph: HashJoinGraph<string> = {
      size: vi.fn<HashJoinGraph<string>["size"]>(() => Promise.resolve(1)),
      page: vi.fn<HashJoinGraph<string>["page"]>((_selector, limit, cursor) => {
        const start = cursor === undefined ? 0 : Number(cursor);
        return Promise.resolve({
          entities: Array.from({ length: limit }, (_, index) =>
            record(`o${start + index}`),
          ),
          cursor: String(start + limit),
        });
      }),
    };
    const result = await runHashEntityJoinCount(
      {
        ...salesOrders,
        where: { path: [hasCustomer], exists: true },
        maxJoinEntities: 3_000,
      },
      "default",
      graph,
      signal,
    );
    expect(result.outcome).toBe("incomplete");
    if (result.outcome !== "incomplete") {
      throw new Error(`Expected incomplete outcome, got ${result.outcome}`);
    }
    expect(result.reason).toContain(
      "took the reads past the 3,000 entities limit: HASH holds more than it did when the count began.",
    );
    expect(
      result.reads.map(({ role, entityTypes }) => ({ role, entityTypes })),
    ).toEqual([
      { role: "counted", entityTypes: ["Sales Order"] },
      { role: "link", entityTypes: ["Has Customer"] },
    ]);
    expect(result.requests).toBeGreaterThan(0);
    const read = result.reads.reduce((sum, { entities }) => sum + entities, 0);
    expect(read).toBeGreaterThan(3_000);
    expect(read).toBeLessThanOrEqual(3_000 + 2 * hashEntityReadMaxLimit);
    expect("count" in result).toBe(false);
  });

  test("a page that fails leaves the count incomplete, saying which read and page", async () => {
    const graph = fakeGraph(data, { failOn: { key: "Fulfills", page: 2 } });
    const result = await runHashEntityJoinCount(
      { ...salesOrders, where: undelivered, groupBy: hasCustomer },
      "default",
      graph,
      signal,
    );
    expect(result.outcome).toBe("incomplete");
    if (result.outcome !== "incomplete") {
      throw new Error(`Expected incomplete outcome, got ${result.outcome}`);
    }
    expect(result.reason).toBe(
      "Reading the Fulfills links failed on page 2: HASH didn't respond in time.",
    );
    expect(result.reads).toContainEqual({
      role: "link",
      entityTypes: ["Fulfills"],
      entities: 2,
    });
    expect(result.requests).toBeGreaterThan(0);
    expect(
      graph.page.mock.calls.some(([selector]) => "entityIds" in selector),
    ).toBe(false);
  });

  test("a failed read of the grouped entities leaves the count incomplete too", async () => {
    const graph = fakeGraph(data, { failOn: { key: "ids", page: 1 } });
    const result = await runHashEntityJoinCount(
      { ...salesOrders, groupBy: hasCustomer },
      "default",
      graph,
      signal,
    );
    expect(result).toMatchObject({
      outcome: "incomplete",
      reason:
        "Reading the grouped entities failed on page 1: HASH didn't respond in time.",
    });
  });

  test("a cancelled count rejects rather than settling", async () => {
    const controller = new AbortController();
    const graph = fakeGraph(data);
    graph.page.mockImplementation(() => {
      controller.abort();
      return Promise.reject(new Error("aborted"));
    });
    await expect(
      runHashEntityJoinCount(
        { ...salesOrders, groupBy: hasCustomer },
        "default",
        graph,
        controller.signal,
      ),
    ).rejects.toThrow("aborted");
  });

  test("short-circuits to 0 without sizing or reading links when no counted entities match", async () => {
    const graph: HashJoinGraph<string> = {
      size: vi.fn<HashJoinGraph<string>["size"]>((selector) => {
        if (selector.entityTypes?.[0] === "Sales Order") {
          return Promise.resolve(0);
        }
        return Promise.reject(new Error("link size should not be queried"));
      }),
      page: vi.fn<HashJoinGraph<string>["page"]>(() =>
        Promise.reject(new Error("no pages should be read")),
      ),
    };
    const result = await runHashEntityJoinCount(
      { ...salesOrders, where: undelivered, groupBy: hasCustomer },
      "default",
      graph,
      signal,
    );
    expect(result).toEqual({
      outcome: "counted",
      webScope: "default",
      ofType: 0,
      count: 0,
      groups: [],
      examples: [],
      reads: [{ role: "counted", entityTypes: ["Sales Order"], entities: 0 }],
      requests: 1,
    });
    expect(graph.size).toHaveBeenCalledTimes(1);
    expect(graph.page).not.toHaveBeenCalled();
  });

  test("short-circuits to 0 without paging or refusing when an exists:true where step has size 0", async () => {
    const graph: HashJoinGraph<string> = {
      size: vi.fn<HashJoinGraph<string>["size"]>((selector) => {
        const type = selector.entityTypes?.[0];
        if (type === "Sales Order") {
          return Promise.resolve(500);
        }
        if (type === "Has Line Item") {
          return Promise.resolve(50_000);
        }
        if (type === "Fulfills") {
          return Promise.resolve(0);
        }
        return Promise.resolve(0);
      }),
      page: vi.fn<HashJoinGraph<string>["page"]>(() =>
        Promise.reject(new Error("no pages should be read")),
      ),
    };
    const result = await runHashEntityJoinCount(
      {
        ...salesOrders,
        where: { path: [hasLineItem, fulfilledBy], exists: true },
        groupBy: hasCustomer,
      },
      "default",
      graph,
      signal,
    );
    expect(result).toEqual({
      outcome: "counted",
      webScope: "default",
      ofType: 500,
      count: 0,
      groups: [],
      examples: [],
      reads: [
        { role: "counted", entityTypes: ["Sales Order"], entities: 0 },
        { role: "link", entityTypes: ["Has Line Item"], entities: 0 },
        { role: "link", entityTypes: ["Fulfills"], entities: 0 },
        { role: "link", entityTypes: ["Has Customer"], entities: 0 },
      ],
      requests: 4,
    });
    expect(graph.page).not.toHaveBeenCalled();
  });

  test("skips paging link types whose size is already 0 under exists:false", async () => {
    const graph = fakeGraph(
      new Map([
        ["Sales Order", [record("o1"), record("o2")]],
        ["Has Line Item", [link("l1", "o1", "i1")]],
        ["Fulfills", []],
      ]),
      { pageSize: 1000 },
    );
    const result = await runHashEntityJoinCount(
      { ...salesOrders, where: undelivered },
      "default",
      graph,
      signal,
    );
    expect(result).toMatchObject({
      outcome: "counted",
      ofType: 2,
      count: 2,
      reads: [
        { role: "counted", entityTypes: ["Sales Order"], entities: 2 },
        { role: "link", entityTypes: ["Has Line Item"], entities: 1 },
        { role: "link", entityTypes: ["Fulfills"], entities: 0 },
      ],
      // 3 sizes + 2 page reads (Fulfills size 0 is not paged).
      requests: 5,
    });
    expect(
      graph.page.mock.calls.some(
        ([selector]) =>
          "entityTypes" in selector && selector.entityTypes?.[0] === "Fulfills",
      ),
    ).toBe(false);
  });

  test("labels a group reached by its live id from the draft edition read by that id", async () => {
    const graph = fakeGraph(
      new Map([
        ["Sales Order", [record("w~o1~d1"), record("w~o1")]],
        ["Has Customer", [link("w~hc1", "w~o1", "w~c1")]],
        ["Customer", [record("w~c1~dc", "Acme (draft)")]],
      ]),
      { pageSize: 1000 },
    );
    const result = await runHashEntityJoinCount(
      { ...salesOrders, groupBy: hasCustomer },
      "default",
      graph,
      signal,
    );
    expect(result).toMatchObject({
      outcome: "counted",
      ofType: 1,
      count: 1,
      groups: [
        { entity: { entityId: "w~c1~dc", label: "Acme (draft)" }, count: 1 },
      ],
      examples: [{ entityId: "w~o1~d1" }],
    });
  });

  test("refuses a join following more distinct link types than the cap before sizing anything", async () => {
    const graph = fakeGraph(data);
    const step = (index: number) => ({
      linkType: `Link ${index}`,
      direction: "outgoing" as const,
    });
    const result = await runHashEntityJoinCount(
      {
        ...salesOrders,
        where: [
          { path: [0, 1, 2, 3].map(step), exists: true },
          { path: [4, 5, 6, 7].map(step), exists: false },
        ],
        groupBy: {
          path: Array.from(
            { length: hashEntityCountMaxJoinLinkTypes - 7 },
            (_, index) => step(index + 8),
          ),
        },
      },
      "default",
      graph,
      signal,
    );
    expect(result).toEqual({
      outcome: "incomplete",
      reason: `The count follows ${hashEntityCountMaxJoinLinkTypes + 1} link types, more than the ${hashEntityCountMaxJoinLinkTypes} a count by links may follow: drop or merge where conditions, or shorten the groupBy path.`,
      reads: [],
      requests: 0,
    });
    expect(graph.size).not.toHaveBeenCalled();
    expect(graph.page).not.toHaveBeenCalled();
  });

  test("sizes and reads many link types with bounded concurrency", async () => {
    const linkTypes = Array.from(
      { length: hashEntityCountMaxJoinLinkTypes },
      (_, index) => `Link ${index}`,
    );
    const inner = fakeGraph(
      new Map([
        ["Sales Order", orders],
        ...linkTypes.map(
          (linkType) =>
            [
              linkType,
              orders.map(({ entityId }) =>
                link(`${linkType}-${entityId}`, entityId, `${entityId}-x`),
              ),
            ] as const,
        ),
      ]),
      { pageSize: 1 },
    );
    let inFlight = 0;
    let maxInFlight = 0;
    const tracked = <Args extends unknown[], Result>(
      call: (...args: Args) => Promise<Result>,
    ) => {
      return async (...args: Args) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        try {
          await new Promise((resolve) => {
            setTimeout(resolve, 1);
          });
          return await call(...args);
        } finally {
          inFlight -= 1;
        }
      };
    };
    const graph: HashJoinGraph<string> = {
      size: tracked(inner.size),
      page: tracked(inner.page),
    };
    const result = await runHashEntityJoinCount(
      {
        ...salesOrders,
        where: linkTypes.map((linkType) => ({
          path: [{ linkType, direction: "outgoing" as const }],
          exists: true,
        })),
      },
      "default",
      graph,
      signal,
    );
    expect(result).toMatchObject({
      outcome: "counted",
      ofType: 3,
      count: 3,
      // 1 + 12 sizes, then 3 pages for each of 13 reads.
      requests: 1 + hashEntityCountMaxJoinLinkTypes + 3 * 13,
    });
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(hashEntityCountJoinConcurrency);
  });

  test("settles incomplete once a join would pass the request ceiling, however small its pages", async () => {
    const graph: HashJoinGraph<string> = {
      size: vi.fn<HashJoinGraph<string>["size"]>(() => Promise.resolve(1)),
      page: vi.fn<HashJoinGraph<string>["page"]>(
        (_selector, _limit, cursor) => {
          const start = cursor === undefined ? 0 : Number(cursor);
          return Promise.resolve({
            entities: [record(`o${start}`)],
            cursor: String(start + 1),
          });
        },
      ),
    };
    const result = await runHashEntityJoinCount(
      { ...salesOrders, where: { path: [hasCustomer], exists: true } },
      "default",
      graph,
      signal,
    );
    expect(result.outcome).toBe("incomplete");
    if (result.outcome !== "incomplete") {
      throw new Error(`Expected incomplete outcome, got ${result.outcome}`);
    }
    expect(result.reason).toContain(
      `past the ${hashEntityCountMaxJoinRequests} graph requests a count by links may make`,
    );
    expect(result.requests).toBe(hashEntityCountMaxJoinRequests);
    expect(
      vi.mocked(graph.size).mock.calls.length +
        vi.mocked(graph.page).mock.calls.length,
    ).toBe(hashEntityCountMaxJoinRequests);
  });

  test("settles incomplete with no count when multi-hop groupBy exceeds the expansion budget", async () => {
    const diamondOrders = Array.from({ length: 5 }, (_, index) =>
      record(`o${index}`),
    );
    const graph = fakeGraph(
      new Map([
        ["Sales Order", diamondOrders],
        [
          "To Hub",
          diamondOrders.flatMap(({ entityId }) => [
            link(`th-${entityId}-1`, entityId, "h1"),
            link(`th-${entityId}-2`, entityId, "h2"),
          ]),
        ],
        [
          "To Target",
          [
            link("tt-1-1", "h1", "t1"),
            link("tt-1-2", "h1", "t2"),
            link("tt-2-1", "h2", "t1"),
            link("tt-2-2", "h2", "t2"),
          ],
        ],
      ]),
      { pageSize: 1000 },
    );
    const result = await runHashEntityJoinCount(
      {
        ...salesOrders,
        groupBy: {
          path: [
            { linkType: "To Hub", direction: "outgoing" },
            { linkType: "To Target", direction: "outgoing" },
          ],
        },
      },
      "default",
      graph,
      signal,
      { maxExpansionSteps: 5 },
    );
    expect(result.outcome).toBe("incomplete");
    expect(result.outcome === "incomplete" ? result.reason : "").toContain(
      "expansion limit",
    );
    expect("count" in result).toBe(false);
  });
});

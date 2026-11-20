import { describe, expect, test, vi } from "vitest";

import { hashEntityCountMaxJoinEntities } from "@hashintel/brunch-agent";

import {
  type HashJoinEntity,
  type HashJoinGraph,
  type HashJoinSelector,
  hashEntityJoinCount,
  hashEntityJoinCountPlan,
  hashJoinPageSize,
  runHashEntityJoinCount,
} from "./brunch-hash-graph-count";

const hasLineItem = {
  linkType: "Has Line Item",
  direction: "outgoing",
} as const;
const fulfilledBy = { linkType: "Fulfills", direction: "incoming" } as const;
const hasCustomer = {
  linkType: "Has Customer",
  direction: "outgoing",
} as const;
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
const links = new Map([
  ["Has Line Item", lineItems],
  ["Fulfills", fulfills],
  ["Has Customer", customers],
]);

describe("the join", () => {
  test("counts only the order none of whose line items is fulfilled under exists false, and the others under exists true", () => {
    const none = hashEntityJoinCount({ where: undelivered }, orders, links);
    expect(none.ofType).toBe(3);
    expect(none.count).toBe(1);
    expect(none.examples.map(({ entityId }) => entityId)).toEqual(["o1"]);
    const some = hashEntityJoinCount(
      { where: { ...undelivered, exists: true } },
      orders,
      links,
    );
    expect(some.count).toBe(2);
    expect(some.examples.map(({ entityId }) => entityId)).toEqual(["o2", "o3"]);
  });

  test("groups by the entity one step away, under each of several and under none for none", () => {
    expect(
      hashEntityJoinCount({ groupBy: hasCustomer }, orders, links).groups,
    ).toEqual(
      new Map([
        ["c1", 2],
        ["c2", 1],
        [null, 1],
      ]),
    );
    expect(
      hashEntityJoinCount(
        { where: undelivered, groupBy: hasCustomer },
        orders,
        links,
      ).groups,
    ).toEqual(new Map([["c1", 1]]));
    expect(
      hashEntityJoinCount(
        { where: { ...undelivered, exists: true }, groupBy: hasCustomer },
        orders,
        links,
      ).groups,
    ).toEqual(
      new Map([
        ["c1", 1],
        ["c2", 1],
        [null, 1],
      ]),
    );
  });

  test("follows links literally by direction, and a link reaches its other end whether or not it was read", () => {
    // o1 is the right end of no Has Customer link, so incoming reaches nothing.
    const incoming = hashEntityJoinCount(
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
    // c2 was never read, but the link to it exists.
    const reachesUnread = hashEntityJoinCount(
      { where: { path: [hasCustomer], exists: true } },
      orders,
      links,
    );
    expect(reachesUnread.count).toBe(2);
  });

  test("without where every entity read counts, and examples are at most three", () => {
    const many = Array.from({ length: 5 }, (_, index) => record(`o${index}`));
    const joined = hashEntityJoinCount({ groupBy: hasCustomer }, many, links);
    expect(joined.count).toBe(5);
    expect(joined.examples).toHaveLength(3);
  });

  test("reads the counted types with propertyEquals and each link type once", () => {
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
        where: { path: [hasCustomer, hasLineItem], exists: true },
        groupBy: hasCustomer,
      }),
    ).toEqual({
      counted: { entityTypes: ["Sales Order"], propertyEquals },
      linkTypes: ["Has Customer", "Has Line Item"],
    });
  });
});

/**
 * A graph over `data`, keyed by the first type selector or `ids`, whose pages
 * hold at most `pageSize` (below the join's own limit, so reads span pages)
 * and give a cursor while more remain.
 */
const fakeGraph = (
  data: ReadonlyMap<string, readonly HashJoinEntity[]>,
  {
    pageSize = 2,
    sizes,
    failOn,
  }: {
    pageSize?: number;
    sizes?: (key: string) => number;
    failOn?: { key: string; page: number };
  } = {},
) => {
  const all = [...data.values()].flat();
  const keyOf = (selector: HashJoinSelector) =>
    "entityIds" in selector ? "ids" : selector.entityTypes[0]!;
  const pagesOf = new Map<string, number>();
  const graph = {
    size: vi.fn<HashJoinGraph["size"]>((selector) =>
      Promise.resolve(
        sizes?.(keyOf(selector)) ?? data.get(keyOf(selector))?.length ?? 0,
      ),
    ),
    page: vi.fn<HashJoinGraph["page"]>((selector, limit, cursor) => {
      const key = keyOf(selector);
      const page = (pagesOf.get(key) ?? 0) + 1;
      pagesOf.set(key, page);
      if (failOn?.key === key && failOn.page === page) {
        return Promise.reject(new Error("HASH didn't respond in time."));
      }
      const matches =
        "entityIds" in selector
          ? all.filter(({ entityId }) => selector.entityIds.includes(entityId))
          : (data.get(key) ?? []);
      const start = cursor === undefined ? 0 : Number(cursor);
      const end = start + Math.min(limit, pageSize);
      return Promise.resolve({
        entities: matches.slice(start, end),
        ...(end < matches.length ? { cursor: String(end) } : {}),
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
      // 4 sizes; pages: 2 + 3 + 2 + 2, then 1 of grouped entities.
      requests: 14,
    });
    // Each page asks for the join's page size, from the cursor the last gave.
    for (const [, limit] of graph.page.mock.calls) {
      expect(limit).toBe(hashJoinPageSize);
    }
    expect(
      graph.page.mock.calls
        .filter(
          ([selector]) =>
            "entityTypes" in selector &&
            selector.entityTypes[0] === "Has Line Item",
        )
        .map(([, , cursor]) => cursor),
    ).toEqual([undefined, "2", "4"]);
    expect(graph.page).toHaveBeenCalledWith(
      { entityIds: ["c1", "c2"] },
      hashJoinPageSize,
      undefined,
      signal,
    );
  });

  test("names a grouped entity it couldn't read by id, unread, and lists the largest groups before summing the rest", async () => {
    // c0 has three orders; c3 to c29 one each: 28 groups.
    const many = Array.from({ length: 30 }, (_, index) => record(`o${index}`));
    const graph = fakeGraph(
      new Map([
        ["Sales Order", many],
        [
          "Has Customer",
          many.map(({ entityId }, index) =>
            link(`hc${index}`, entityId, `c${index < 3 ? 0 : index}`),
          ),
        ],
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
    expect(result.count).toBe(30);
    expect(result.groups).toHaveLength(25);
    expect(result.groups?.[0]).toEqual({
      entity: { entityId: "c0" },
      unread: true,
      count: 3,
    });
    expect(result.otherGroups).toEqual({ groups: 3, count: 3 });
  });

  test("refuses before reading any page when the reads would exceed the budget", async () => {
    const graph = fakeGraph(data, {
      sizes: (key) =>
        key === "Sales Order" ? hashEntityCountMaxJoinEntities - 10 : 6,
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
      webScope: "default",
      reads: [
        {
          role: "counted",
          entityTypes: ["Sales Order"],
          entities: hashEntityCountMaxJoinEntities - 10,
        },
        { role: "link", entityTypes: ["Has Line Item"], entities: 6 },
        { role: "link", entityTypes: ["Fulfills"], entities: 6 },
      ],
      requests: 3,
    });
    expect(graph.page).not.toHaveBeenCalled();
  });

  test("a read that grows past the budget part-way stops at the budget, incomplete, with no count", async () => {
    // The counted type looked small, but every page is full and gives a cursor.
    const graph = {
      size: vi.fn<HashJoinGraph["size"]>(() => Promise.resolve(1)),
      page: vi.fn<HashJoinGraph["page"]>((_selector, limit, cursor) => {
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
      { ...salesOrders, where: { path: [hasCustomer], exists: true } },
      "default",
      graph,
      signal,
    );
    expect(result).toEqual({
      outcome: "incomplete",
      webScope: "default",
      reason: expect.stringContaining(
        "would have read past the 20,000 entities one count may read",
      ),
      reads: [
        {
          role: "counted",
          entityTypes: ["Sales Order"],
          entities: expect.any(Number),
        },
        {
          role: "link",
          entityTypes: ["Has Customer"],
          entities: expect.any(Number),
        },
      ],
      requests: expect.any(Number),
    });
    if (result.outcome !== "incomplete") {
      return;
    }
    expect(result.reads.reduce((sum, { entities }) => sum + entities, 0)).toBe(
      hashEntityCountMaxJoinEntities,
    );
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
    expect(result).toEqual({
      outcome: "incomplete",
      webScope: "default",
      reason:
        "Reading the Fulfills links failed on page 2: HASH didn't respond in time.",
      reads: expect.arrayContaining([
        { role: "link", entityTypes: ["Fulfills"], entities: 2 },
      ]),
      requests: expect.any(Number),
    });
    // Nothing is joined or labelled after a failure.
    expect(graph.page).not.toHaveBeenCalledWith(
      expect.objectContaining({ entityIds: expect.anything() }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
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
});

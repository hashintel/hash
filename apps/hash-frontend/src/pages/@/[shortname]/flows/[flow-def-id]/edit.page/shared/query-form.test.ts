import { describe, expect, it } from "vitest";

import { emptyQueryForm, readQueryForm, toEntityQuery } from "./query-form";

import type { ConditionValueKind, QueryForm } from "./query-form";
import type { BaseUrl } from "@blockprotocol/type-system";
import type { EntityQuery } from "@local/hash-isomorphic-utils/flows/types";

const shipment =
  "https://example.com/@acme/types/entity-type/shipment/" as BaseUrl;
const delivery =
  "https://example.com/@acme/types/entity-type/delivery/" as BaseUrl;
const receivedDate =
  "https://example.com/@acme/types/property-type/received-date/" as BaseUrl;
const status =
  "https://example.com/@acme/types/property-type/status/" as BaseUrl;

const valueKinds = new Map<BaseUrl, ConditionValueKind>([
  [receivedDate, { kind: "date" }],
  [status, { kind: "status", options: ["Active", "Suspended", "Pending"] }],
]);

const read = (query: EntityQuery) =>
  readQueryForm(query, (baseUrl) => valueKinds.get(baseUrl));

const typeIs = (baseUrl: BaseUrl) => ({
  equal: [{ path: ["type", "baseUrl"] }, { parameter: baseUrl }],
});

const receivedAfter = {
  greater: [
    { path: ["properties", receivedDate] },
    { parameter: "2026-09-30" },
  ],
};

const statusIsActive = {
  equal: [{ path: ["properties", status] }, { parameter: "Active" }],
};

describe("toEntityQuery and readQueryForm", () => {
  it("writes types, conditions joined with OR, a sort order and a limit as the graph takes them, and reads them back", () => {
    const form: QueryForm = {
      entityTypeBaseUrls: [shipment, delivery],
      conditions: [
        {
          propertyBaseUrl: receivedDate,
          operator: "after",
          value: "2026-09-30",
        },
        { propertyBaseUrl: status, operator: "is", value: "Active" },
      ],
      join: "any",
      sort: "newestFirst",
      limit: 50,
    };

    const query = toEntityQuery(form);

    expect(query).toEqual({
      filter: {
        all: [
          { any: [typeIs(shipment), typeIs(delivery)] },
          { any: [receivedAfter, statusIsActive] },
        ],
      },
      sortingPaths: [
        {
          path: ["createdAtTransactionTime"],
          ordering: "descending",
          nulls: "last",
        },
      ],
      limit: 50,
    });
    expect(read(query)).toEqual(form);
  });

  it("writes a query with no types or conditions as one matching every entity, the step's default", () => {
    expect(toEntityQuery(emptyQueryForm)).toEqual({ filter: { all: [] } });
    expect(read({ filter: { all: [] } })).toEqual(emptyQueryForm);
  });

  it("reads back one condition joined with OR and no types, which looks like a group of types", () => {
    const form: QueryForm = {
      ...emptyQueryForm,
      conditions: [
        { propertyBaseUrl: status, operator: "is", value: "Active" },
      ],
      join: "any",
    };

    expect(toEntityQuery(form).filter).toEqual({
      all: [{ any: [statusIsActive] }],
    });
    expect(read(toEntityQuery(form))).toEqual(form);
  });

  it.each([
    [
      "is",
      {
        equal: [
          { path: ["properties", receivedDate] },
          { parameter: "2026-09-30" },
        ],
      },
    ],
    [
      "before",
      {
        less: [
          { path: ["properties", receivedDate] },
          { parameter: "2026-09-30" },
        ],
      },
    ],
    ["after", receivedAfter],
    ["isEmpty", { not: { exists: { path: ["properties", receivedDate] } } }],
    ["isNotEmpty", { exists: { path: ["properties", receivedDate] } }],
  ] as const)(
    "writes a date that %s as the graph's comparison, and reads it back",
    (operator, clause) => {
      const form: QueryForm = {
        ...emptyQueryForm,
        conditions: [
          operator === "isEmpty" || operator === "isNotEmpty"
            ? { propertyBaseUrl: receivedDate, operator }
            : { propertyBaseUrl: receivedDate, operator, value: "2026-09-30" },
        ],
      };

      expect(toEntityQuery(form).filter).toEqual({ all: [{ all: [clause] }] });
      expect(read(toEntityQuery(form))).toEqual(form);
    },
  );

  it("writes a status that isn't a value as not equal to it", () => {
    const form: QueryForm = {
      ...emptyQueryForm,
      conditions: [
        { propertyBaseUrl: status, operator: "isNot", value: "Pending" },
      ],
    };

    expect(toEntityQuery(form).filter).toEqual({
      all: [
        {
          all: [
            {
              notEqual: [
                { path: ["properties", status] },
                { parameter: "Pending" },
              ],
            },
          ],
        },
      ],
    });
    expect(read(toEntityQuery(form))).toEqual(form);
  });

  it.each([
    [
      "says whether to include drafts",
      { filter: { all: [] }, includeDrafts: false },
    ],
    [
      "is over a range of time",
      {
        filter: { all: [] },
        temporalAxes: {
          pinned: { axis: "transactionTime", timestamp: null },
          variable: {
            axis: "decisionTime",
            interval: { start: null, end: null },
          },
        },
      },
    ],
    [
      "sorts by two paths",
      {
        filter: { all: [] },
        sortingPaths: [
          { path: ["label"], ordering: "ascending", nulls: "last" },
          { path: ["uuid"], ordering: "ascending", nulls: "last" },
        ],
      },
    ],
    [
      "puts entities with no name first",
      {
        filter: { all: [] },
        sortingPaths: [
          { path: ["label"], ordering: "ascending", nulls: "first" },
        ],
      },
    ],
    ["has a filter of another shape", { filter: { any: [] } }],
    [
      "filters on the web",
      {
        filter: {
          all: [{ equal: [{ path: ["webId"] }, { parameter: "web" }] }],
        },
      },
    ],
    [
      "picks types by version",
      {
        filter: {
          all: [
            {
              any: [
                {
                  equal: [
                    { path: ["type", "versionedUrl"] },
                    { parameter: `${shipment}v/1` },
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
    [
      "has conditions before its types",
      {
        filter: {
          all: [{ all: [statusIsActive] }, { any: [typeIs(shipment)] }],
        },
      },
    ],
    [
      "groups conditions inside its conditions",
      {
        filter: {
          all: [{ all: [statusIsActive, { any: [receivedAfter] }] }],
        },
      },
    ],
    ["has an empty group of types", { filter: { all: [{ any: [] }] } }],
    [
      "mixes types and conditions in one group",
      {
        filter: { all: [{ any: [typeIs(shipment), statusIsActive] }] },
      },
    ],
    [
      "compares a property that isn't a date or a status",
      {
        filter: {
          all: [
            {
              all: [
                {
                  equal: [
                    { path: ["properties", `${status}other/`] },
                    { parameter: "Active" },
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
    [
      "orders statuses, which have no order",
      {
        filter: {
          all: [
            {
              all: [
                {
                  less: [
                    { path: ["properties", status] },
                    { parameter: "Active" },
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
    [
      "has a status that isn't one of its options",
      {
        filter: {
          all: [
            {
              all: [
                {
                  equal: [
                    { path: ["properties", status] },
                    { parameter: "Archived" },
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
    [
      "has a date that doesn't exist",
      {
        filter: {
          all: [
            {
              all: [
                {
                  greater: [
                    { path: ["properties", receivedDate] },
                    { parameter: "2026-02-30" },
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
    [
      "converts the value it compares with",
      {
        filter: {
          all: [
            {
              all: [
                {
                  greater: [
                    { path: ["properties", receivedDate] },
                    {
                      parameter: "2026-09-30",
                      convert: { from: "a", to: "b" },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
  ])("can't read back a query that %s", (_, query) => {
    expect(read(query as EntityQuery)).toBeNull();
  });
});

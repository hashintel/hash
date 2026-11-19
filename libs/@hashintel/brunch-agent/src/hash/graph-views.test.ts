import { decode } from "@toon-format/toon";
import Papa from "papaparse";
import { expect, test } from "vitest";

import {
  hashEntityDetailsMaxEntities,
  hashEntityProfileListUpTo,
  hashGraphViewMaxBytes,
  parseHashEntityDetailsInput,
  parseHashEntityTabularInput,
  renderHashEntityDetails,
  renderHashEntityProfile,
  renderHashEntitySurvey,
  renderHashEntityTabular,
} from "./graph-views";

import type { HashEntityReadResult } from "./graph-reads";

const web = "00000000-0000-4000-8000-000000000001";
const id = (n: number) =>
  `${web}~00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const type = (slug: string, version = 1) =>
  `https://hash.ai/@h/types/entity-type/${slug}/v/${version}`;
const property = (slug: string) =>
  `https://hash.ai/@h/types/property-type/${slug}/`;

const entity = (
  n: number,
  entityTypeIds: string[],
  properties: Record<string, unknown>,
  extra: Partial<HashEntityReadResult["entities"][number]> = {},
): HashEntityReadResult["entities"][number] => ({
  entityId: id(n),
  editionId: `edition-${n}`,
  webId: web,
  entityTypeIds,
  properties,
  draft: false,
  matched: true,
  ...extra,
});

const link = (
  n: number,
  slug: string,
  from: number,
  to: number,
  properties = {},
) =>
  entity(n, [type(slug)], properties, {
    matched: false,
    linkData: { leftEntityId: id(from), rightEntityId: id(to) },
  });

/** Order 1 has line item 2, which procures material 3; material 3 is stored at site 4. */
const read: HashEntityReadResult = {
  propertyTypes: [
    {
      baseUrl: property("order-number"),
      propertyTypeId: `${property("order-number")}v/1`,
      title: "Order Number",
    },
    {
      baseUrl: property("order-quantity"),
      propertyTypeId: `${property("order-quantity")}v/1`,
      title: "Order Quantity",
      description: "How many units were ordered",
    },
    {
      baseUrl: property("quantity"),
      propertyTypeId: `${property("quantity")}v/1`,
      title: "Quantity",
    },
  ],
  entityTypes: [
    { entityTypeId: type("purchase-order"), title: "Purchase Order" },
    { entityTypeId: type("line-item"), title: "Line Item" },
    { entityTypeId: type("material"), title: "Material" },
  ],
  entities: [
    entity(
      1,
      [type("purchase-order")],
      { [property("order-number")]: "4500" },
      { label: "PO 4500" },
    ),
    entity(
      2,
      [type("line-item")],
      { [property("order-quantity")]: 200 },
      { matched: false },
    ),
    entity(
      3,
      [type("material")],
      {},
      { matched: false, label: "Raw material" },
    ),
    link(10, "has-line-item", 1, 2),
    link(11, "procures", 2, 3),
    link(12, "stored-at", 3, 4, { [property("quantity")]: 7 }),
  ],
};

const tablesOf = (text: string): Record<string, unknown[]> =>
  Object.fromEntries(
    text
      .split(/^# table /mu)
      .slice(1)
      .map((section) => {
        const [heading, ...csv] = section.split("\n");
        return [
          heading?.split(" ")[0] ?? "",
          Papa.parse<Record<string, string>>(csv.join("\n"), { header: true })
            .data,
        ];
      }),
  );

test("tabular makes rows of matched entities only, with outgoing links as id columns", () => {
  const view = renderHashEntityTabular(read, {});
  expect(view.refused).toBe(false);
  expect(tablesOf(view.text)).toEqual({
    purchase_order: [
      {
        id: id(1),
        editionId: "edition-1",
        label: "PO 4500",
        order_number: "4500",
        has_line_item: id(2),
      },
    ],
  });
});

test("tabular gives links with properties a table of their own, and reports what it didn't find", () => {
  const view = renderHashEntityTabular(
    {
      ...read,
      entities: read.entities.map((each) => ({
        ...each,
        matched: each.entityId === id(3),
      })),
    },
    parseHashEntityTabularInput({
      entityIds: [id(3), id(9)],
      properties: ["quantity", "colour"],
    }),
  );
  expect(tablesOf(view.text).stored_at).toEqual([
    {
      id: id(12),
      editionId: "edition-12",
      from: id(3),
      to: id(4),
      quantity: "7",
    },
  ]);
  expect(view.text).toContain(`Not returned: ${id(9)}`);
  expect(view.text).toContain("Properties none of these entities hold: colour");
});

test("details shows editions and links in both directions, and names ids it didn't return", () => {
  const view = renderHashEntityDetails(
    {
      ...read,
      entities: read.entities.map((each) => ({
        ...each,
        matched: each.entityId === id(2),
      })),
    },
    parseHashEntityDetailsInput({ entityIds: [id(2), id(9)] }),
  );
  const details = decode(view.text) as {
    entities: { editionId: string; linksTo: unknown; linkedFrom: unknown }[];
    read: { notes: string[] };
  };
  expect(details.entities).toMatchObject([
    {
      editionId: "edition-2",
      linksTo: { procures: [{ id: id(3), label: "Raw material" }] },
      linkedFrom: { has_line_item: [{ id: id(1), label: "PO 4500" }] },
    },
  ]);
  expect(details.read.notes[0]).toContain(`Not returned: ${id(9)}`);
});

test("details refuses more ids than it reads, and full values for ids it wasn't given, saying what to do", () => {
  const ids = Array.from(
    { length: hashEntityDetailsMaxEntities + 1 },
    (_, index) => id(index + 100),
  );
  expect(() => parseHashEntityDetailsInput({ entityIds: ids })).toThrow(
    /as rows with hash_query_entities/u,
  );
  expect(() =>
    parseHashEntityDetailsInput({ entityIds: [id(1)], fullValuesFor: [id(2)] }),
  ).toThrow(/add it to entityIds/u);
});

test("an id must be copied whole, and a type URL must carry its version", () => {
  expect(() =>
    parseHashEntityTabularInput({
      entityIds: ["00000000-0000-4000-8000-000000000001"],
    }),
  ).toThrow(/webId~entityUuid/u);
  expect(() =>
    parseHashEntityTabularInput({
      entityTypes: ["https://hash.ai/@h/types/entity-type/material/"],
    }),
  ).toThrow(/needs its version/u);
  expect(
    parseHashEntityTabularInput({
      entityTypes: ["Material", type("material")],
    }),
  ).toBeTruthy();
});

test("a profile lists a kind's entities only when few, and says how to get the rest", () => {
  const many = Array.from(
    { length: hashEntityProfileListUpTo + 1 },
    (_, index) =>
      entity(index + 100, [type("material")], {
        [property("quantity")]: index % 2,
      }),
  );
  const profile = decode(
    renderHashEntityProfile(
      { ...read, entities: many },
      { entityTypes: ["Material"] },
    ).text,
  ) as {
    kinds: { entities?: unknown; properties: unknown }[];
    read: { notes: string[] };
  };
  expect(profile.kinds[0]?.entities).toBeUndefined();
  expect(profile.kinds[0]?.properties).toEqual({
    quantity: {
      values: [
        { value: 0, count: 13 },
        { value: 1, count: 13 },
      ],
    },
  });
  expect(profile.read.notes[0]).toContain(
    `material (${hashEntityProfileListUpTo + 1})`,
  );
});

test("a survey counts kinds and links between kinds, telling two versions of a type apart", () => {
  const survey = decode(
    renderHashEntitySurvey({
      webIds: [web],
      entityTypes: [
        { entityTypeId: type("supplier", 1), title: "Supplier" },
        { entityTypeId: type("supplier", 2), title: "Supplier" },
      ],
      groups: [
        { entityTypeIds: [type("supplier", 1)], count: 2 },
        { entityTypeIds: [type("supplier", 2)], count: 5 },
      ],
      links: [
        {
          entityTypeIds: [type("supplies")],
          leftEntityTypeIds: [type("supplier", 2)],
          rightEntityTypeIds: [type("material")],
          count: 9,
          withProperties: 0,
        },
      ],
    }).text,
  ) as { types: unknown; links: unknown };
  expect(survey.types).toEqual([
    { name: "supplier_v2", title: "Supplier", count: 5 },
    { name: "supplier_v1", title: "Supplier", count: 2 },
  ]);
  expect(survey.links).toMatchObject([
    { name: "supplies", from: "supplier_v2", to: "material", count: 9 },
  ]);
});

test("a view too large to return is refused with its shape, and returns none of it", () => {
  const rows = Array.from({ length: 800 }, (_, index) =>
    entity(index + 100, [type("material")], {
      [property("order-number")]: "x".repeat(80),
    }),
  );
  const view = renderHashEntityTabular({ ...read, entities: rows }, {});
  expect(view.refused).toBe(true);
  expect(view.text).toMatch(
    /^refused: This read would be \d+ KB, over the 64 KB/u,
  );
  expect(view.text).toContain("material 800 rows × 4 columns");
  expect(view.text).not.toContain(id(100));
  expect(new TextEncoder().encode(view.text).length).toBeLessThan(
    hashGraphViewMaxBytes,
  );
});

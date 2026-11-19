import { decode } from "@toon-format/toon";
import { encode as o200kTokens } from "gpt-tokenizer/encoding/o200k_base";
import Papa from "papaparse";
import { expect, test } from "vitest";

import {
  hashEntityDetailsMaxEntities,
  hashEntityProfileListUpTo,
  hashGraphViewMaxTokens,
  parseHashEntityDetailsInput,
  parseHashEntityTabularInput,
  renderHashEntityDetails,
  renderHashEntityProfile,
  renderHashEntitySurvey,
  renderHashEntityTabular,
} from "./graph-views";
import { estimateTokens } from "./graph-views/size";

import type { HashEntityReadResult } from "./graph-reads";

const web = "00000000-0000-4000-8000-000000000001";
const id = (n: number) =>
  `${web}~00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
/** An id as a table writes it when it is in the table's web. */
const short = (n: number) => id(n).slice(web.length);
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
  const elsewhere =
    "00000000-0000-4000-8000-000000000002~00000000-0000-4000-8000-000000000099";
  const view = renderHashEntityTabular(
    {
      ...read,
      entities: [
        ...read.entities,
        entity(
          13,
          [type("has-vendor")],
          {},
          {
            matched: false,
            linkData: { leftEntityId: id(1), rightEntityId: elsewhere },
          },
        ),
      ],
    },
    {},
  );
  expect(view.refused).toBe(false);
  expect(view.text).toContain(
    `# ids: Ids written ~entityUuid are in web ${web}: the full id, to read or cite one, is ${web}~entityUuid.`,
  );
  expect(tablesOf(view.text)).toEqual({
    purchase_order: [
      {
        id: short(1),
        editionId: "edition-1",
        label: "PO 4500",
        order_number: "4500",
        has_line_item: short(2),
        has_vendor: elsewhere,
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
      id: short(12),
      editionId: "edition-12",
      from: short(3),
      to: short(4),
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

test("details reads part of a large value by path, outlining a part still too large", () => {
  const definition = {
    parameters: Array.from({ length: 40 }, (_, index) => ({
      name: `parameter ${index}`,
      variableName: `rate_${index}`,
      defaultValue: String(index / 1000),
    })),
    scenarios: Array.from({ length: 30 }, (_, index) => ({
      name: `scenario ${index}`,
      parameterOverrides: Object.fromEntries(
        Array.from({ length: 60 }, (__, inner) => [
          `rate_${inner}`,
          `${index}.${inner}`,
        ]),
      ),
    })),
  };
  const net = {
    ...read,
    propertyTypes: [
      {
        baseUrl: property("definition"),
        propertyTypeId: `${property("definition")}v/1`,
        title: "Definition",
      },
    ],
    entities: [
      entity(5, [type("petri-net")], { [property("definition")]: definition }),
    ],
  };
  const detailsOf = (fullValuesFor?: unknown[]) =>
    decode(
      renderHashEntityDetails(
        net,
        parseHashEntityDetailsInput({
          entityIds: [id(5)],
          ...(fullValuesFor ? { fullValuesFor } : {}),
        }),
      ).text,
    ) as {
      entities: {
        properties: { definition: string };
        values?: Record<string, unknown>;
      }[];
      read: { notes: string[] };
    };

  const summary = detailsOf();
  expect(summary.entities[0]?.properties.definition).toMatch(
    /^<object, [\d.]+ KB: scenarios [\d.]+ KB, parameters [\d.]+ KB>$/u,
  );

  const parameters = detailsOf([
    { entityId: id(5), path: ["definition", "parameters"] },
  ]);
  expect(parameters.entities[0]?.values?.["definition.parameters"]).toEqual(
    definition.parameters,
  );

  const scenarios = detailsOf([
    { entityId: id(5), path: ["definition", "scenarios"] },
  ]);
  const outlined = scenarios.entities[0]?.values?.[
    "definition.scenarios"
  ] as unknown[];
  expect(outlined).toHaveLength(30);
  expect(outlined[0]).toMatch(
    /^<object, [\d.]+ KB: parameterOverrides [\d.]+ KB, name>$/u,
  );
  const oneScenario = detailsOf([
    { entityId: id(5), path: ["definition", "scenarios", "0"] },
  ]);
  expect(oneScenario.entities[0]?.values?.["definition.scenarios.0"]).toEqual(
    definition.scenarios[0],
  );
  expect(scenarios.read.notes.join(" ")).toContain("outlined one level down");

  const wrong = detailsOf([
    { entityId: id(5), path: ["definition", "params"] },
  ]);
  expect(wrong.read.notes.join(" ")).toContain("nothing at definition.params");
});

test("the legend keeps each property's versioned id, listing every version a read matched", () => {
  const view = renderHashEntityDetails(
    {
      ...read,
      propertyTypes: [
        ...read.propertyTypes,
        {
          baseUrl: property("order-quantity"),
          propertyTypeId: `${property("order-quantity")}v/2`,
          title: "Order Quantity",
          description: "How many cases were ordered, 12 units each",
        },
      ],
      entities: read.entities.map((each) => ({
        ...each,
        matched: each.entityId === id(1) || each.entityId === id(2),
      })),
    },
    parseHashEntityDetailsInput({ entityIds: [id(1), id(2)] }),
  );
  const { legend } = decode(view.text) as {
    legend: { properties: Record<string, unknown> };
  };
  expect(legend.properties).toEqual({
    order_number: {
      id: `${property("order-number")}v/1`,
      title: "Order Number",
    },
    order_quantity: {
      baseUrl: property("order-quantity"),
      versions: [
        {
          id: `${property("order-quantity")}v/1`,
          title: "Order Quantity",
          description: "How many units were ordered",
        },
        {
          id: `${property("order-quantity")}v/2`,
          title: "Order Quantity",
          description: "How many cases were ordered, 12 units each",
        },
      ],
    },
  });
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
    /^refused: This read would be about [\d,]+ tokens, over the 20,000/u,
  );
  expect(view.text).toContain("material 800 rows × 4 columns");
  expect(view.text).not.toContain(short(100));
  expect(estimateTokens(view.text)).toBeLessThan(hashGraphViewMaxTokens);
});

test("the token estimate errs high, by little, against o200k on the views' kinds of text", () => {
  const samples = {
    rows: renderHashEntityTabular(
      {
        ...read,
        entities: Array.from({ length: 50 }, (_, index) =>
          entity(index + 100, [type("material")], {
            [property("order-number")]: `45000${index}`,
            [property("order-quantity")]: index * 7.5,
          }),
        ),
      },
      {},
    ).text,
    details: renderHashEntityDetails(
      read,
      parseHashEntityDetailsInput({ entityIds: [id(1), id(2), id(3)] }),
    ).text,
    prose:
      "The planned lead time to procure or deliver an item, in days. A purchase order records what was ordered from a vendor, and when.",
  };
  for (const [kind, text] of Object.entries(samples)) {
    const ratio = estimateTokens(text) / o200kTokens(text).length;
    expect({ kind, high: ratio >= 1, close: ratio < 1.3 }).toEqual({
      kind,
      high: true,
      close: true,
    });
  }
});

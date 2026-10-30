/**
 * What the model is shown of each HASH graph read, rendered from what HASH's
 * page returns. The reads' path through the agent is in
 * `../hash-graph-reads.test.ts`.
 */
import { expect, test } from "vitest";

import {
  hashEntityReadEmptyNote,
  hashEntityReadForModel,
  hashEntityTypeReadForModel,
  hashWebReadForModel,
} from "./hash-graph-reads.ts";

const aliceWeb = "7bb3aed2-1d4c-447b-bc75-6ca7028a9b5a";
const userTypeId = "https://hash.ai/@h/types/entity-type/user/v/7";
const netTypeId = "https://hash.ai/@h/types/entity-type/petri-net/v/1";
const property = (slug: string) =>
  `https://hash.ai/@h/types/property-type/${slug}/`;
const displayName =
  "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/";

const alice = {
  entityId: `${aliceWeb}~${aliceWeb}`,
  editionId: "2806bc27-0000-4000-8000-000000000000",
  webId: aliceWeb,
  entityTypeIds: [userTypeId],
  properties: {
    [property("kratos-identity-id")]: "kratos-1",
    [property("email")]: ["alice@example.com"],
    [property("shortname")]: "alice",
    [property("enabled-feature-flags")]: [
      "workers",
      "ai",
      "supplyChain",
      "dashboards",
    ],
    [displayName]: "Alice",
  },
  draft: false,
  matched: true,
};

/** A net definition of about 8.5 KB: 3 places, 2 transitions, 2 parameters. */
const definition = {
  places: Array.from({ length: 3 }, (_, index) => ({
    id: `place-${index}`,
    name: `Place ${index}`,
    notes: "x".repeat(1_600),
  })),
  transitions: Array.from({ length: 2 }, (_, index) => ({
    id: `transition-${index}`,
    name: `Transition ${index}`,
    kernel: "y".repeat(1_500),
  })),
  parameters: [
    { id: "p1", variableName: "lead_time", defaultValue: "5" },
    { id: "p2", variableName: "risk", defaultValue: "0.1" },
  ],
  types: [],
};
const definitionBytes = new TextEncoder().encode(
  JSON.stringify(definition),
).length;

const net = {
  entityId: `${aliceWeb}~net`,
  editionId: "edition-net",
  webId: aliceWeb,
  entityTypeIds: [netTypeId],
  properties: {
    [property("title")]: "Supply Chain",
    [property("definition-object")]: definition,
  },
  draft: false,
  matched: true,
};

const read = (entities: object[]) => ({
  propertyTypes: [
    {
      baseUrl: property("email"),
      title: "Email",
      description: "An email address",
    },
    { baseUrl: displayName, title: "Display Name" },
    {
      baseUrl: property("definition-object"),
      title: "Definition Object",
      description:
        "A definition of something, represented as an opaque JSON object.",
    },
  ],
  entityTypes: [
    { entityTypeId: userTypeId, title: "User" },
    { entityTypeId: netTypeId, title: "Petri Net" },
  ],
  entities,
});

test("a user entity renders compactly, with readable names and its identifiers", () => {
  const text = hashEntityReadForModel(read([alice]));
  expect(text).toBe(
    [
      "entities: 1",
      "properties:",
      "  email: Email — An email address",
      "  display_name: Display Name",
      "entity types:",
      `  User: ${userTypeId}`,
      "entities:",
      '- User "Alice"',
      `  entityId: ${alice.entityId}`,
      `  editionId: ${alice.editionId}`,
      "  kratos_identity_id: kratos-1",
      "  email: [alice@example.com]",
      "  shortname: alice",
      "  enabled_feature_flags: [workers, ai, supplyChain, dashboards]",
      "  display_name: Alice",
    ].join("\n"),
  );
  // The page's JSON for the same entity is larger, by its URL keys.
  expect(text.length).toBeLessThan(
    JSON.stringify({ entities: [alice] }).length,
  );
});

test("a net's definition is summarised with its size and shape, and the read says how to see it", () => {
  const text = hashEntityReadForModel(read([net]));
  expect(definitionBytes).toBeGreaterThan(8_000);
  expect(text).toContain(
    `  definition_object: <object, ${(definitionBytes / 1000).toFixed(1)} KB: 3 places, 2 transitions, 2 parameters, 0 types>`,
  );
  expect(text).toContain('- Petri Net "Supply Chain"');
  expect(text).toContain(`  entityId: ${net.entityId}`);
  expect(text).toContain("  editionId: edition-net");
  expect(text).toContain("in fullValuesFor to see them");
  expect(text).not.toContain("place-0");
  expect(text.length).toBeLessThan(1_000);
});

test("an entity named in fullValuesFor shows its values in full; others stay summarised", () => {
  const other = { ...net, entityId: `${aliceWeb}~other` };
  const text = hashEntityReadForModel(read([net, other]), [net.entityId]);
  expect(text).toContain(`  definition_object: ${JSON.stringify(definition)}`);
  const otherBlock = text.slice(text.indexOf(`entityId: ${other.entityId}`));
  expect(otherBlock).toContain("definition_object: <object,");
});

test("a property's unit reaches the model in its description, beside its value", () => {
  const leadTime = property("planned-delivery-time");
  const text = hashEntityReadForModel({
    propertyTypes: [
      {
        baseUrl: leadTime,
        title: "Planned Delivery Time",
        description:
          "The planned lead time to procure or deliver an item, in days.",
      },
    ],
    entityTypes: [],
    entities: [
      {
        ...alice,
        entityTypeIds: [
          "http://localhost:3000/@alice/types/entity-type/supplier/v/1",
        ],
        properties: { [leadTime]: 5 },
      },
    ],
  });
  expect(text).toContain(
    "  planned_delivery_time: Planned Delivery Time — The planned lead time to procure or deliver an item, in days.",
  );
  expect(text).toContain("  planned_delivery_time: 5");
  // A type the page didn't title is shown by its slug, beside its id.
  expect(text).toContain(
    "  supplier: http://localhost:3000/@alice/types/entity-type/supplier/v/1",
  );
});

test("links, drafts and entities reached by links are marked", () => {
  const link = {
    ...alice,
    entityId: `${aliceWeb}~link`,
    entityTypeIds: ["https://hash.ai/@h/types/entity-type/has/v/1"],
    properties: {},
    draft: true,
    matched: false,
    linkData: { leftEntityId: alice.entityId, rightEntityId: net.entityId },
  };
  const text = hashEntityReadForModel(read([alice, link]));
  expect(text).toContain("entities: 2 (1 reached by links)");
  expect(text).toContain(
    [
      "- has (linked) (draft)",
      `  entityId: ${link.entityId}`,
      `  editionId: ${link.editionId}`,
      `  linksFrom: ${alice.entityId}`,
      `  linksTo: ${net.entityId}`,
    ].join("\n"),
  );
});

test("strings that YAML would misread are quoted, and two properties sharing a slug are told apart", () => {
  const otherName =
    "https://blockprotocol.org/@blockprotocol/types/property-type/shortname/";
  const text = hashEntityReadForModel(
    read([
      {
        ...alice,
        properties: {
          [property("shortname")]: "true",
          [otherName]: "a: b",
          [property("summary")]: "line one\nline two",
          [property("count")]: 3,
        },
      },
    ]),
  );
  expect(text).toContain(`  ${property("shortname")}: "true"`);
  expect(text).toContain(`  ${otherName}: "a: b"`);
  expect(text).toContain('  summary: "line one\\nline two"');
  expect(text).toContain("  count: 3");
});

test("a long text is summarised with its size and how it begins", () => {
  const text = hashEntityReadForModel(
    read([
      { ...alice, properties: { [property("summary")]: "word ".repeat(200) } },
    ]),
  );
  expect(text).toMatch(/ {2}summary: <text, 1\.0 KB: "word word .*…">/);
});

test("an empty read says nothing matched", () => {
  expect(hashEntityReadForModel(read([]))).toBe(hashEntityReadEmptyNote);
});

test("a result in an unknown shape fails the read rather than reaching the model", () => {
  expect(() => hashEntityReadForModel({ entities: [alice] })).toThrow(
    "unknown shape",
  );
});

test("entity types render one block each, with property names as an entity read shows them", () => {
  const text = hashEntityTypeReadForModel({
    entityTypes: [
      {
        entityTypeId:
          "http://localhost:3000/@alice/types/entity-type/supplier/v/1",
        title: "Supplier",
        description: "A vendor that supplies goods.",
        properties: [
          {
            baseUrl: property("planned-delivery-time"),
            title: "Planned Delivery Time",
          },
        ],
        links: [
          {
            linkEntityTypeId: "https://hash.ai/@h/types/entity-type/has/v/1",
            title: "Has",
          },
        ],
      },
    ],
  });
  expect(text).toBe(
    [
      "entity types: 1",
      "- Supplier: http://localhost:3000/@alice/types/entity-type/supplier/v/1",
      "  description: A vendor that supplies goods.",
      "  properties:",
      "    planned_delivery_time: Planned Delivery Time",
      "  links:",
      "    Has: https://hash.ai/@h/types/entity-type/has/v/1 -> any",
    ].join("\n"),
  );
});

test("webs render one line each, with their ids", () => {
  expect(
    hashWebReadForModel({
      webs: [
        { webId: aliceWeb, kind: "user", shortname: "alice", name: "Alice" },
        { webId: "org-web", kind: "organization" },
      ],
    }),
  ).toBe(
    [
      "webs: 2",
      `- user "Alice" @alice webId: ${aliceWeb}`,
      "- organization webId: org-web",
    ].join("\n"),
  );
});

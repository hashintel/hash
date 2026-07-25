// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { generateTableDataFromEndpointRows } from "./generate-table-data-from-endpoint-rows";

import type {
  BaseUrl,
  EntityId,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type {
  EntityTableRow as EndpointRow,
  EntityTableLinkEndpoint,
} from "@local/hash-graph-sdk/entity";
import type {
  ClosedMultiEntityTypesRootMap,
  EntityTypeResolveDefinitions,
} from "@local/hash-graph-sdk/ontology";

const webId = "00000000-0000-0000-0000-000000000001";
const personTypeId =
  "https://example.com/types/entity-type/person/v/1" as VersionedUrl;
const petTypeId =
  "https://example.com/types/entity-type/pet/v/1" as VersionedUrl;
const linkTypeId =
  "https://example.com/types/entity-type/friend-of/v/1" as VersionedUrl;
const nameBaseUrl = "https://example.com/types/property-type/name/" as BaseUrl;
const namePropertyTypeId =
  "https://example.com/types/property-type/name/v/1" as VersionedUrl;

const entityId = (uuid: string) => `${webId}~${uuid}` as EntityId;

const closedTypeFor = (
  entityTypeId: VersionedUrl,
  title: string,
  { isLink = false }: { isLink?: boolean } = {},
) => ({
  schema: {
    allOf: [
      {
        $id: entityTypeId,
        title,
        description: title,
        allOf: isLink
          ? [{ $id: linkTypeId, title: "Link", description: "Link" }]
          : [],
        properties: { [nameBaseUrl]: { $ref: namePropertyTypeId } },
        required: [],
      },
    ],
    properties: { [nameBaseUrl]: { $ref: namePropertyTypeId } },
    required: [],
  },
});

const closedMultiEntityTypesRootMap = {
  [personTypeId]: closedTypeFor(personTypeId, "Person"),
  [petTypeId]: closedTypeFor(petTypeId, "Pet"),
  [linkTypeId]: closedTypeFor(linkTypeId, "Friend Of", { isLink: true }),
} as unknown as ClosedMultiEntityTypesRootMap;

const definitions = {
  dataTypes: {},
  entityTypes: {},
  propertyTypes: {
    [namePropertyTypeId]: {
      title: "Name",
      oneOf: [{ $ref: "https://example.com/types/data-type/text/v/1" }],
    },
  },
} as unknown as EntityTypeResolveDefinitions;

const row = (
  uuid: string,
  {
    entityTypeIds = [personTypeId] as [VersionedUrl, ...VersionedUrl[]],
    label,
    name,
    sourceEntity,
    targetEntity,
  }: {
    entityTypeIds?: [VersionedUrl, ...VersionedUrl[]];
    label?: string;
    name?: string;
    sourceEntity?: EntityTableLinkEndpoint;
    targetEntity?: EntityTableLinkEndpoint;
  } = {},
) =>
  ({
    entityId: entityId(uuid),
    entityEditionId: uuid,
    label,
    entityTypeIds,
    entityTypeTitles: entityTypeIds.map(() => "Person"),
    createdAtTransactionTime: "2025-01-01T00:00:00Z",
    createdAtDecisionTime: "2025-01-01T00:00:00Z",
    editionCreatedAtDecisionTime: "2025-01-02T00:00:00Z",
    createdBy: webId,
    lastEditedBy: webId,
    archived: false,
    properties: name === undefined ? {} : { [nameBaseUrl]: name },
    propertiesMetadata:
      name === undefined
        ? { value: {} }
        : { value: { [nameBaseUrl]: { metadata: {} } } },
    sourceEntity,
    targetEntity,
  }) as unknown as EndpointRow;

const generate = (
  endpointRows: EndpointRow[],
  previous?: Parameters<
    typeof generateTableDataFromEndpointRows
  >[0]["previous"],
) =>
  generateTableDataFromEndpointRows({
    closedMultiEntityTypesRootMap,
    definitions,
    endpointRows,
    previous,
  });

describe("generateTableDataFromEndpointRows", () => {
  it("prefers the server's label and falls back to generating one", () => {
    const { tableData } = generate([
      row("1", { label: "From the server", name: "Alice" }),
      row("2", { name: "Bob" }),
    ]);

    expect(tableData.rows[0]?.entityLabel).toBe("From the server");
    expect(tableData.rows[1]?.entityLabel).toBe("Bob");
  });

  it("appends a page without re-deriving the rows before it", () => {
    const first = generate([row("1", { name: "Alice" })]);
    const second = generate([row("2", { name: "Bob" })], first.aggregates);

    expect(
      second.tableData.rows.map((tableRow) => tableRow.entityLabel),
    ).toEqual(["Alice", "Bob"]);
    // The rows the first page produced are carried over, not rebuilt: their
    // identity survives the fold.
    expect(second.tableData.rows[0]).toBe(first.tableData.rows[0]);
  });

  it("keeps a page's aggregates untouched when the next page folds in", () => {
    const first = generate([row("1", { name: "Alice" })]);
    const rowsAfterFirstPage = first.tableData.rows.length;

    generate([row("2", { name: "Bob" })], first.aggregates);

    expect(first.tableData.rows.length).toBe(rowsAfterFirstPage);
  });

  it("narrows the shared type title across pages", () => {
    const first = generate([row("1"), row("2")]);
    expect(
      first.tableData.columns.some((column) => column.title === "Person"),
    ).toBe(true);

    const second = generate(
      [row("3", { entityTypeIds: [petTypeId] })],
      first.aggregates,
    );
    expect(
      second.tableData.columns.some((column) => column.title === "Person"),
    ).toBe(false);
  });

  it("renders a link row whose endpoint is hidden by permissions", () => {
    const { tableData } = generate([
      row("1", {
        entityTypeIds: [linkTypeId],
        sourceEntity: {
          entityId: entityId("2"),
          label: "Alice",
          entityTypeIds: [personTypeId],
        },
      }),
    ]);

    const linkRow = tableData.rows[0];
    expect(linkRow?.sourceEntity?.label).toBe("Alice");
    expect(linkRow?.targetEntity).toBeUndefined();
  });

  it("falls back to the endpoint's id when it carries no label", () => {
    const { tableData } = generate([
      row("1", {
        entityTypeIds: [linkTypeId],
        sourceEntity: {
          entityId: entityId("2"),
          entityTypeIds: [personTypeId],
        },
      }),
    ]);

    expect(tableData.rows[0]?.sourceEntity?.label).toBe(entityId("2"));
  });

  it("throws when the response is missing a property type", () => {
    expect(() =>
      generateTableDataFromEndpointRows({
        closedMultiEntityTypesRootMap,
        definitions: {
          ...definitions,
          propertyTypes: {},
        } as unknown as EntityTypeResolveDefinitions,
        endpointRows: [row("1", { name: "Alice" })],
      }),
    ).toThrow(/Property type not found/);
  });
});

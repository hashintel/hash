import { describe, expect, it } from "vitest";

import {
  getConditionProperties,
  getPropertiesOfTypes,
} from "./condition-properties";

import type {
  BaseUrl,
  DataType,
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

const dataTypeId = (name: string) =>
  `https://example.com/@acme/types/data-type/${name}/v/1` as VersionedUrl;

const dataType = (
  name: string,
  schema: Partial<DataType>,
): [VersionedUrl, DataTypeWithMetadata] => [
  dataTypeId(name),
  { schema: { $id: dataTypeId(name), ...schema } } as DataTypeWithMetadata,
];

const dataTypes = Object.fromEntries([
  dataType("text", { type: "string" }),
  dataType("date", { type: "string", format: "date" }),
  dataType("status", {
    type: "string",
    enum: ["Active", "Suspended"],
  }),
  dataType("shipment-status", { allOf: [{ $ref: dataTypeId("status") }] }),
  dataType("no-options", { type: "string", enum: [] as unknown as [string] }),
  dataType("date-or-text", {
    anyOf: [{ type: "string", format: "date" }, { type: "string" }],
  }),
  dataType("only-date", { anyOf: [{ type: "string", format: "date" }] }),
]);

const propertyType = (
  name: string,
  dataTypeNames: string[],
): PropertyTypeWithMetadata =>
  ({
    metadata: {
      recordId: {
        baseUrl: `https://example.com/@acme/types/property-type/${name}/`,
      },
    },
    schema: {
      title: name,
      oneOf: dataTypeNames.map((dataTypeName) => ({
        $ref: dataTypeId(dataTypeName),
      })),
    },
  }) as unknown as PropertyTypeWithMetadata;

const valueKindsOf = (propertyTypes: PropertyTypeWithMetadata[]) =>
  Object.fromEntries(
    [
      ...getConditionProperties({
        latestPropertyTypes: propertyTypes,
        dataTypes,
      }),
    ].map(([baseUrl, { title, valueKind }]) => [title, { baseUrl, valueKind }]),
  );

describe("getConditionProperties", () => {
  it("keeps properties whose single data type is a date or a status, including one inherited", () => {
    expect(
      valueKindsOf([
        propertyType("received", ["date"]),
        propertyType("state", ["shipment-status"]),
        propertyType("note", ["text"]),
        propertyType("received-or-note", ["date", "text"]),
        propertyType("blank", ["no-options"]),
      ]),
    ).toEqual({
      received: {
        baseUrl: "https://example.com/@acme/types/property-type/received/",
        valueKind: { kind: "date" },
      },
      state: {
        baseUrl: "https://example.com/@acme/types/property-type/state/",
        valueKind: { kind: "status", options: ["Active", "Suspended"] },
      },
    });
  });

  it("reads a data type that allows one set of constraints, not one that allows several", () => {
    expect(
      Object.keys(
        valueKindsOf([
          propertyType("sent", ["only-date"]),
          propertyType("sent-or-note", ["date-or-text"]),
        ]),
      ),
    ).toEqual(["sent"]);
  });
});

describe("getPropertiesOfTypes", () => {
  const propertyTypeUrl = (name: string) =>
    `https://example.com/@acme/types/property-type/${name}/`;

  const entityType = (
    name: string,
    properties: Record<string, unknown>,
  ): EntityTypeWithMetadata =>
    ({
      metadata: {
        recordId: {
          baseUrl: `https://example.com/@acme/types/entity-type/${name}/`,
        },
      },
      schema: {
        $id: `https://example.com/@acme/types/entity-type/${name}/v/1`,
        properties,
      },
    }) as unknown as EntityTypeWithMetadata;

  const shipment = entityType("shipment", {
    [propertyTypeUrl("received")]: {
      $ref: `${propertyTypeUrl("received")}v/1`,
    },
  });
  const report = entityType("report", {
    [propertyTypeUrl("sent")]: {
      type: "array",
      items: { $ref: `${propertyTypeUrl("sent")}v/1` },
    },
  });
  const conditionProperties = getConditionProperties({
    latestPropertyTypes: [
      propertyType("received", ["date"]),
      propertyType("sent", ["date"]),
    ],
    dataTypes,
  });

  it("leaves out a property that types only have as a list, whether types are picked or not", () => {
    const titles = (entityTypeBaseUrls: string[]) =>
      getPropertiesOfTypes({
        conditionProperties,
        entityTypeBaseUrls: entityTypeBaseUrls as BaseUrl[],
        latestEntityTypes: [shipment, report],
        entityTypes: [shipment, report],
        entityTypeParentIds: {},
      }).map(({ title }) => title);

    expect(titles([])).toEqual(["received"]);
    expect(titles([report.metadata.recordId.baseUrl])).toEqual([]);
  });
});

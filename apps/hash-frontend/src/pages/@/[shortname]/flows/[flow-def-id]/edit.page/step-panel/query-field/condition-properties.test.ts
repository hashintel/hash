import { describe, expect, it } from "vitest";

import {
  getConditionProperties,
  getLatestDataTypeIds,
} from "./condition-properties";

import type { ConditionOntology } from "./condition-properties";
import type {
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

const propertyTypeUrl = (name: string) =>
  `https://example.com/@acme/types/property-type/${name}/`;

const propertyType = (
  name: string,
  dataTypeNames: string[],
): PropertyTypeWithMetadata =>
  ({
    metadata: { recordId: { baseUrl: propertyTypeUrl(name) } },
    schema: {
      $id: `${propertyTypeUrl(name)}v/1`,
      title: name,
      oneOf: dataTypeNames.map((dataTypeName) => ({
        $ref: dataTypeId(dataTypeName),
      })),
    },
  }) as unknown as PropertyTypeWithMetadata;

const entityTypeId = (name: string) =>
  `https://example.com/@acme/types/entity-type/${name}/v/1` as VersionedUrl;

/** An entity type with each property as a single value, or as a list when its name is in `lists`. */
const entityType = (
  name: string,
  propertyNames: string[],
  lists: string[] = [],
): EntityTypeWithMetadata =>
  ({
    schema: {
      $id: entityTypeId(name),
      properties: Object.fromEntries(
        propertyNames.map((propertyName) => {
          const reference = { $ref: `${propertyTypeUrl(propertyName)}v/1` };

          return [
            propertyTypeUrl(propertyName),
            lists.includes(propertyName)
              ? { type: "array", items: reference }
              : reference,
          ];
        }),
      ),
    },
  }) as unknown as EntityTypeWithMetadata;

const ontologyOf = (
  propertyTypes: PropertyTypeWithMetadata[],
  entityTypes: EntityTypeWithMetadata[],
  entityTypeParentIds: Record<VersionedUrl, VersionedUrl[]> = {},
): ConditionOntology => ({
  entityTypes,
  entityTypeParentIds,
  propertyTypes: Object.fromEntries(
    propertyTypes.map((type) => [type.schema.$id, type]),
  ),
  latestDataTypeIds: getLatestDataTypeIds(propertyTypes),
  dataTypes,
});

const valueKindsOf = (ontology: ConditionOntology, typeNames: string[]) =>
  Object.fromEntries(
    getConditionProperties(ontology, typeNames.map(entityTypeId)).map(
      ({ title, valueKind }) => [title, valueKind],
    ),
  );

describe("getConditionProperties", () => {
  it("keeps properties whose single data type is a date or a status, including one inherited", () => {
    const properties = [
      propertyType("received", ["date"]),
      propertyType("state", ["shipment-status"]),
      propertyType("note", ["text"]),
      propertyType("received-or-note", ["date", "text"]),
      propertyType("blank", ["no-options"]),
    ];
    const shipment = entityType(
      "shipment",
      properties.map(({ schema }) => schema.title),
    );

    expect(
      valueKindsOf(ontologyOf(properties, [shipment]), ["shipment"]),
    ).toEqual({
      received: { kind: "date" },
      state: { kind: "status", options: ["Active", "Suspended"] },
    });
  });

  it("reads a data type that allows one set of constraints, not one that allows several", () => {
    const properties = [
      propertyType("sent", ["only-date"]),
      propertyType("sent-or-note", ["date-or-text"]),
    ];
    const report = entityType("report", ["sent", "sent-or-note"]);

    expect(
      Object.keys(valueKindsOf(ontologyOf(properties, [report]), ["report"])),
    ).toEqual(["sent"]);
  });

  it("offers the properties of the given types and their parents, not those they only have as a list", () => {
    const properties = [
      propertyType("received", ["date"]),
      propertyType("sent", ["date"]),
      propertyType("state", ["status"]),
    ];
    const ontology = ontologyOf(
      properties,
      [
        entityType("item", ["state"]),
        entityType("shipment", ["received"]),
        entityType("report", ["sent"], ["sent"]),
      ],
      { [entityTypeId("shipment")]: [entityTypeId("item")] },
    );

    expect(Object.keys(valueKindsOf(ontology, ["shipment"]))).toEqual([
      "received",
      "state",
    ]);
    expect(valueKindsOf(ontology, ["report"])).toEqual({});
  });

  it("offers a property one type has as a single value even when a type before it has it as a list", () => {
    const properties = [propertyType("sent", ["date"])];
    const ontology = ontologyOf(properties, [
      entityType("report", ["sent"], ["sent"]),
      entityType("letter", ["sent"]),
    ]);

    expect(valueKindsOf(ontology, ["report", "letter"])).toEqual({
      sent: { kind: "date" },
    });
  });
});

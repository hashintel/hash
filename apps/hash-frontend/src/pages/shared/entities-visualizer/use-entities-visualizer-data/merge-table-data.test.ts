import { describe, expect, it } from "vitest";

import { mergeTableData } from "./merge-table-data";

import type {
  EntitiesTableColumn,
  EntitiesTableData,
  EntitiesTableRow,
} from "../entities-table-data";
import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";
import type { ClosedDataTypeDefinition } from "@local/hash-graph-sdk/ontology";

const alphaPropertyBaseUrl =
  "https://example.com/@test/types/property-type/alpha/" as BaseUrl;
const betaPropertyBaseUrl =
  "https://example.com/@test/types/property-type/beta/" as BaseUrl;

const typeV1 =
  "https://example.com/@test/types/entity-type/thing/v/1" as VersionedUrl;
const typeV2 =
  "https://example.com/@test/types/entity-type/thing/v/2" as VersionedUrl;

const column = (
  id: EntitiesTableColumn["id"],
  title: string,
): EntitiesTableColumn => ({ id, title, width: 100 });

const row = (entityLabel: string): EntitiesTableRow =>
  ({ entityLabel }) as EntitiesTableRow;

const dataTypeDefinition = (name: string): ClosedDataTypeDefinition =>
  ({ schema: { title: name } }) as ClosedDataTypeDefinition;

const metresDefinition = dataTypeDefinition("Metres");
const feetDefinition = dataTypeDefinition("Feet");
const textDefinition = dataTypeDefinition("Text");

describe("mergeTableData", () => {
  const base: EntitiesTableData = {
    columns: [
      column("entityLabel", "Entity"),
      column("lastEdited", "Last Edited"),
      column(betaPropertyBaseUrl, "Beta"),
    ],
    dataTypeDefinitions: { "https://metres/v/1": metresDefinition },
    entityTypesWithMultipleVersionsPresent: new Set([typeV1]),
    rows: [row("first")],
    visibleDataTypeIdsByPropertyBaseUrl: {
      [betaPropertyBaseUrl]: new Set([metresDefinition]),
    },
  };

  const next: EntitiesTableData = {
    columns: [
      column("entityLabel", "Entity"),
      column("sourceEntity", "Source"),
      column(alphaPropertyBaseUrl, "Alpha"),
    ],
    dataTypeDefinitions: { "https://text/v/1": textDefinition },
    entityTypesWithMultipleVersionsPresent: new Set([typeV2]),
    rows: [row("second")],
    visibleDataTypeIdsByPropertyBaseUrl: {
      [betaPropertyBaseUrl]: new Set([feetDefinition]),
      [alphaPropertyBaseUrl]: new Set([textDefinition]),
    },
  };

  const merged = mergeTableData(base, next);

  it("concatenates rows in page order", () => {
    expect(merged.rows.map(({ entityLabel }) => entityLabel)).toEqual([
      "first",
      "second",
    ]);
  });

  it("unions columns, keeping static columns (in first-seen order) before title-sorted property columns", () => {
    expect(merged.columns.map(({ id }) => id)).toEqual([
      "entityLabel",
      "lastEdited",
      "sourceEntity",
      alphaPropertyBaseUrl,
      betaPropertyBaseUrl,
    ]);
  });

  it("merges the data type pools", () => {
    expect(merged.dataTypeDefinitions).toEqual({
      "https://metres/v/1": metresDefinition,
      "https://text/v/1": textDefinition,
    });
  });

  it("unions the multiple-versions markers", () => {
    expect(merged.entityTypesWithMultipleVersionsPresent).toEqual(
      new Set([typeV1, typeV2]),
    );
  });

  it("unions the visible data types per property, without mutating either input", () => {
    expect(
      merged.visibleDataTypeIdsByPropertyBaseUrl[betaPropertyBaseUrl],
    ).toEqual(new Set([metresDefinition, feetDefinition]));
    expect(
      merged.visibleDataTypeIdsByPropertyBaseUrl[alphaPropertyBaseUrl],
    ).toEqual(new Set([textDefinition]));

    expect(
      base.visibleDataTypeIdsByPropertyBaseUrl[betaPropertyBaseUrl],
    ).toEqual(new Set([metresDefinition]));
    expect(
      next.visibleDataTypeIdsByPropertyBaseUrl[betaPropertyBaseUrl],
    ).toEqual(new Set([feetDefinition]));
  });
});

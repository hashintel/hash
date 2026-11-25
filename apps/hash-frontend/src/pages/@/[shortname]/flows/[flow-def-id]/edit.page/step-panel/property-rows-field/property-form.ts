import { validateVersionedUrl } from "@blockprotocol/type-system";

import { isValueOfKind } from "../shared/condition-properties";
import { hasOnlyKeys, isRecord } from "../shared/condition-targets";

import type { PropertyValueKind } from "../shared/condition-properties";
import type {
  BaseUrl,
  PropertyObjectWithMetadata,
  PropertyPatchOperation,
  PropertyWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

/** A property's value as a row types it: text for text, dates and times, a number, or true or false. */
export type RowValue = string | number | boolean;

/** A value for a property, with the data type the graph checks it against. */
export type SetRow = {
  propertyBaseUrl: BaseUrl;
  op: "set";
  value: RowValue;
  dataTypeId: VersionedUrl;
};

/** Update entity's removal of a property. */
export type RemoveRow = { propertyBaseUrl: BaseUrl; op: "remove" };

export type PropertyRow = SetRow | RemoveRow;

/** The kind of a property's value, or `undefined` for a property the rows can't show. */
export type GetValueKind = (baseUrl: BaseUrl) => PropertyValueKind | undefined;

const toPropertyWithMetadata = ({
  value,
  dataTypeId,
}: SetRow): PropertyWithMetadata => ({ value, metadata: { dataTypeId } });

/** Reads one value the rows made: a value of the property's kind with its data type ID, and nothing else. */
const readSetRow = (
  propertyBaseUrl: BaseUrl,
  property: unknown,
  getValueKind: GetValueKind,
): SetRow | undefined => {
  const valueKind = getValueKind(propertyBaseUrl);

  if (
    !valueKind ||
    !isRecord(property) ||
    !hasOnlyKeys(property, ["value", "metadata"]) ||
    !isValueOfKind(valueKind, property.value) ||
    !isRecord(property.metadata) ||
    !hasOnlyKeys(property.metadata, ["dataTypeId"]) ||
    typeof property.metadata.dataTypeId !== "string" ||
    validateVersionedUrl(property.metadata.dataTypeId).type !== "Ok"
  ) {
    return undefined;
  }

  return {
    propertyBaseUrl,
    op: "set",
    value: property.value,
    dataTypeId: property.metadata.dataTypeId as VersionedUrl,
  };
};

/** Create entity's properties: each row's value keyed by its property, with its data type ID. */
export const toPropertiesWithMetadata = (
  rows: SetRow[],
): PropertyObjectWithMetadata => ({
  value: Object.fromEntries(
    rows.map((row) => [row.propertyBaseUrl, toPropertyWithMetadata(row)]),
  ),
});

/** Reads Create entity's saved properties back into rows, or `null` if the rows can't show them. */
export const readPropertiesForm = (
  properties: unknown,
  getValueKind: GetValueKind,
): SetRow[] | null => {
  if (
    !isRecord(properties) ||
    !hasOnlyKeys(properties, ["value"]) ||
    !isRecord(properties.value)
  ) {
    return null;
  }

  const rows = Object.entries(properties.value).map(([baseUrl, property]) =>
    readSetRow(baseUrl as BaseUrl, property, getValueKind),
  );

  return rows.every((row) => row !== undefined) ? rows : null;
};

/** Update entity's patches, one per row. A value is an `add`, which also overwrites; `replace` fails on a missing property. */
export const toPropertyPatches = (
  rows: PropertyRow[],
): PropertyPatchOperation[] =>
  rows.map((row) =>
    row.op === "set"
      ? {
          op: "add",
          path: [row.propertyBaseUrl],
          property: toPropertyWithMetadata(row),
        }
      : { op: "remove", path: [row.propertyBaseUrl] },
  );

/** Reads Update entity's saved patches back into rows, or `null` if the rows can't show them. */
export const readPatchesForm = (
  patches: unknown,
  getValueKind: GetValueKind,
): PropertyRow[] | null => {
  if (!Array.isArray(patches)) {
    return null;
  }

  const rows: PropertyRow[] = [];

  for (const patch of patches as unknown[]) {
    if (!isRecord(patch) || !Array.isArray(patch.path)) {
      return null;
    }

    const [propertyBaseUrl, ...rest] = patch.path as unknown[];

    if (
      typeof propertyBaseUrl !== "string" ||
      rest.length > 0 ||
      rows.some((row) => row.propertyBaseUrl === propertyBaseUrl)
    ) {
      return null;
    }

    if (patch.op === "remove" && hasOnlyKeys(patch, ["op", "path"])) {
      if (!getValueKind(propertyBaseUrl as BaseUrl)) {
        return null;
      }

      rows.push({ propertyBaseUrl: propertyBaseUrl as BaseUrl, op: "remove" });
      continue;
    }

    const row =
      patch.op === "add" && hasOnlyKeys(patch, ["op", "path", "property"])
        ? readSetRow(propertyBaseUrl as BaseUrl, patch.property, getValueKind)
        : undefined;

    if (!row) {
      return null;
    }

    rows.push(row);
  }

  return rows;
};

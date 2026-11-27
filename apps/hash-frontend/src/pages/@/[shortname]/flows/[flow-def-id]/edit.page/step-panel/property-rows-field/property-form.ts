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
import type {
  PropertyValueSource,
  StepInputSource,
  ValueSource,
} from "@local/hash-isomorphic-utils/flows/types";

/** A property's value as a row types it: text for text, dates and times, a number, or true or false. */
export type RowValue = string | number | boolean;

/** A value a row takes instead of a typed one: a flow input, an earlier step's output, or a For each's item. */
export type RowSource = Exclude<ValueSource, { kind: "constant" }>;

/**
 * A value for a property, typed or taken from `from`, with the data type the graph checks it against.
 */
export type SetRow = {
  propertyBaseUrl: BaseUrl;
  op: "set";
  dataTypeId: VersionedUrl;
} & (
  | { value: RowValue; from?: undefined }
  | { value?: undefined; from: RowSource }
);

type TypedSetRow = Extract<SetRow, { value: RowValue }>;

/** Update entity's removal of a property. */
export type RemoveRow = { propertyBaseUrl: BaseUrl; op: "remove" };

export type PropertyRow = SetRow | RemoveRow;

/** The kind of a property's value, or `undefined` for a property the rows can't show. */
export type GetValueKind = (baseUrl: BaseUrl) => PropertyValueKind | undefined;

/** Whether a row takes no value from elsewhere: its value is typed, or it removes its property. */
const isTyped = <Row extends PropertyRow>(
  row: Row,
): row is Exclude<Row, { from: RowSource }> =>
  row.op === "remove" || row.from === undefined;

const toPropertyWithMetadata = ({
  value,
  dataTypeId,
}: TypedSetRow): PropertyWithMetadata => ({ value, metadata: { dataTypeId } });

/**
 * A row's value among values that each have a source. A typed one is a constant of the kind its JSON value is: what
 * the graph checks it against is its data type, as it does when every value is typed.
 */
const toPropertyValueSource = (row: SetRow): PropertyValueSource => ({
  dataTypeId: row.dataTypeId,
  from: row.from ?? {
    kind: "constant",
    payload: {
      kind:
        typeof row.value === "number"
          ? "Number"
          : typeof row.value === "boolean"
            ? "Boolean"
            : "Text",
      value: row.value,
    },
  },
});

/** Reads one typed value the rows made: a value of the property's kind with its data type ID, and nothing else. */
const readTypedRow = (
  propertyBaseUrl: BaseUrl,
  property: unknown,
  getValueKind: GetValueKind,
): TypedSetRow | undefined => {
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

/**
 * Reads one value that has a source of its own. A constant reads as a typed value; a value wrapped into a list is
 * one the rows never make.
 */
const readSourcedRow = (
  propertyBaseUrl: BaseUrl,
  { dataTypeId, from }: PropertyValueSource,
  getValueKind: GetValueKind,
): SetRow | undefined => {
  const valueKind = getValueKind(propertyBaseUrl);

  if (!valueKind || validateVersionedUrl(dataTypeId).type !== "Ok") {
    return undefined;
  }

  const row = {
    propertyBaseUrl,
    op: "set" as const,
    dataTypeId: dataTypeId as VersionedUrl,
  };

  if (from.kind !== "constant") {
    return from.wrap ? undefined : { ...row, from };
  }

  const { value } = from.payload;

  return isValueOfKind(valueKind, value) ? { ...row, value } : undefined;
};

/**
 * Create entity's properties as its input takes them. While every value is typed they're one fixed value, each keyed
 * by its property with its data type ID, as the graph takes them; once a value comes from elsewhere, each has a
 * source of its own.
 */
export const toPropertiesSource = (rows: SetRow[]): StepInputSource =>
  rows.every(isTyped)
    ? {
        kind: "constant",
        payload: {
          kind: "PropertyObjectWithMetadata",
          value: {
            value: Object.fromEntries(
              rows.map((row) => [
                row.propertyBaseUrl,
                toPropertyWithMetadata(row),
              ]),
            ),
          } satisfies PropertyObjectWithMetadata,
        },
      }
    : {
        kind: "properties",
        values: Object.fromEntries(
          rows.map((row) => [row.propertyBaseUrl, toPropertyValueSource(row)]),
        ),
      };

const readFixedProperties = (
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
    readTypedRow(baseUrl as BaseUrl, property, getValueKind),
  );

  return rows.every((row) => row !== undefined) ? rows : null;
};

/** Reads Create entity's saved properties back into rows, or `null` if the rows can't show them. */
export const readPropertiesForm = (
  source: StepInputSource,
  getValueKind: GetValueKind,
): SetRow[] | null => {
  if (source.kind === "constant") {
    return source.payload.kind === "PropertyObjectWithMetadata"
      ? readFixedProperties(source.payload.value, getValueKind)
      : null;
  }

  if (source.kind !== "properties") {
    return null;
  }

  const rows = Object.entries(source.values).map(([baseUrl, valueSource]) =>
    readSourcedRow(baseUrl as BaseUrl, valueSource, getValueKind),
  );

  return rows.every((row) => row !== undefined) ? rows : null;
};

/**
 * Update entity's patches as its input takes them, one per row: one fixed list while every value is typed, else each
 * value with a source of its own. A value is an `add`, which also overwrites; `replace` fails on a missing property.
 */
export const toPatchesSource = (rows: PropertyRow[]): StepInputSource =>
  rows.every(isTyped)
    ? {
        kind: "constant",
        payload: {
          kind: "PropertyPatch",
          value: rows.map((row) =>
            row.op === "set"
              ? {
                  op: "add",
                  path: [row.propertyBaseUrl],
                  property: toPropertyWithMetadata(row),
                }
              : { op: "remove", path: [row.propertyBaseUrl] },
          ) satisfies PropertyPatchOperation[],
        },
      }
    : {
        kind: "property-patches",
        patches: rows.map((row) =>
          row.op === "set"
            ? {
                op: "add",
                path: [row.propertyBaseUrl],
                ...toPropertyValueSource(row),
              }
            : { op: "remove", path: [row.propertyBaseUrl] },
        ),
      };

/**
 * Reads patches into rows, or `null` if the rows can't show them: each must set or remove one property the rows can
 * show, and no two the same one. `readSetRow` reads the value of a patch that adds one.
 */
const readPatchRows = <Patch extends Record<string, unknown>>(
  patches: Patch[],
  getValueKind: GetValueKind,
  readSetRow: (propertyBaseUrl: BaseUrl, patch: Patch) => SetRow | undefined,
): PropertyRow[] | null => {
  const rows: PropertyRow[] = [];

  for (const patch of patches) {
    if (!Array.isArray(patch.path)) {
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

    /* Replacing fails when the entity doesn't have the property, so the rows never make it. */
    const row =
      patch.op === "add"
        ? readSetRow(propertyBaseUrl as BaseUrl, patch)
        : undefined;

    if (!row) {
      return null;
    }

    rows.push(row);
  }

  return rows;
};

/** Reads Update entity's saved patches back into rows, or `null` if the rows can't show them. */
export const readPatchesForm = (
  source: StepInputSource,
  getValueKind: GetValueKind,
): PropertyRow[] | null => {
  if (source.kind === "property-patches") {
    return readPatchRows(source.patches, getValueKind, (baseUrl, patch) =>
      patch.op === "remove"
        ? undefined
        : readSourcedRow(baseUrl, patch, getValueKind),
    );
  }

  if (source.kind !== "constant" || source.payload.kind !== "PropertyPatch") {
    return null;
  }

  const patches = source.payload.value;

  return Array.isArray(patches) && patches.every(isRecord)
    ? readPatchRows(patches, getValueKind, (baseUrl, patch) =>
        hasOnlyKeys(patch, ["op", "path", "property"])
          ? readTypedRow(baseUrl, patch.property, getValueKind)
          : undefined,
      )
    : null;
};

/**
 * The row a problem with an input is about, from where the problem is in the input's source (see `getPathInSource`):
 * the value of a property, or of the patch at an index, each of which is one row. `undefined` if it's about the input
 * as a whole.
 */
export const getProblemRowIndex = (
  pathInSource: (string | number)[],
  rows: PropertyRow[],
): number | undefined => {
  const [section, key] = pathInSource;

  if (section === "patches" && typeof key === "number") {
    return key < rows.length ? key : undefined;
  }

  const rowIndex =
    section === "values"
      ? rows.findIndex((row) => row.propertyBaseUrl === key)
      : -1;

  return rowIndex === -1 ? undefined : rowIndex;
};

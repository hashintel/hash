import { describe, expect, it } from "vitest";

import {
  validatePropertiesWithMetadata,
  validatePropertyPatches,
} from "@local/hash-isomorphic-utils/flows/property-values";

import {
  readPatchesForm,
  readPropertiesForm,
  toPropertiesWithMetadata,
  toPropertyPatches,
} from "./property-form";

import type { PropertyValueKind } from "../shared/condition-properties";
import type { PropertyRow, SetRow } from "./property-form";
import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";

const nameUrl =
  "https://example.com/@acme/types/property-type/name/" as BaseUrl;
const statusUrl =
  "https://example.com/@acme/types/property-type/status/" as BaseUrl;
const employeesUrl =
  "https://example.com/@acme/types/property-type/employees/" as BaseUrl;
const foundedUrl =
  "https://example.com/@acme/types/property-type/founded/" as BaseUrl;

const textId =
  "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1" as VersionedUrl;
const statusId =
  "https://example.com/@acme/types/data-type/status/v/2" as VersionedUrl;
const integerId =
  "https://example.com/@acme/types/data-type/integer/v/1" as VersionedUrl;

const valueKinds = new Map<BaseUrl, PropertyValueKind>([
  [nameUrl, { kind: "Text" }],
  [statusUrl, { kind: "Text", options: ["Lead", "Contacted"] }],
  [employeesUrl, { kind: "Number" }],
  [foundedUrl, { kind: "Date" }],
]);
const getValueKind = (baseUrl: BaseUrl) => valueKinds.get(baseUrl);

const setRows: SetRow[] = [
  { propertyBaseUrl: nameUrl, op: "set", value: "Acme", dataTypeId: textId },
  {
    propertyBaseUrl: statusUrl,
    op: "set",
    value: "Contacted",
    dataTypeId: statusId,
  },
  { propertyBaseUrl: employeesUrl, op: "set", value: 0, dataTypeId: integerId },
];

describe("toPropertiesWithMetadata", () => {
  it("gives each value with its data type ID, as the graph takes them, and reads back as it was set", () => {
    const properties = toPropertiesWithMetadata(setRows);

    expect(properties).toEqual({
      value: {
        [nameUrl]: { value: "Acme", metadata: { dataTypeId: textId } },
        [statusUrl]: { value: "Contacted", metadata: { dataTypeId: statusId } },
        [employeesUrl]: { value: 0, metadata: { dataTypeId: integerId } },
      },
    });
    expect(validatePropertiesWithMetadata(properties)).toBeUndefined();
    expect(readPropertiesForm(properties, getValueKind)).toEqual(setRows);
  });
});

describe("toPropertyPatches", () => {
  it("adds a set property, so it doesn't matter whether the entity has it, removes a removed one, and reads back as it was set", () => {
    const rows: PropertyRow[] = [
      {
        propertyBaseUrl: statusUrl,
        op: "set",
        value: "Contacted",
        dataTypeId: statusId,
      },
      { propertyBaseUrl: foundedUrl, op: "remove" },
    ];
    const patches = toPropertyPatches(rows);

    expect(patches).toEqual([
      {
        op: "add",
        path: [statusUrl],
        property: { value: "Contacted", metadata: { dataTypeId: statusId } },
      },
      { op: "remove", path: [foundedUrl] },
    ]);
    expect(validatePropertyPatches(patches)).toBeUndefined();
    expect(readPatchesForm(patches, getValueKind)).toEqual(rows);
  });
});

describe("readPropertiesForm", () => {
  it("can't show properties it didn't make", () => {
    const text = { dataTypeId: textId };
    const unreadable = [
      /* The graph needs every value's data type ID. */
      { value: { [nameUrl]: { value: "Acme", metadata: {} } } },
      {
        value: {
          [nameUrl]: {
            value: "Acme",
            metadata: { ...text, provenance: { sources: [] } },
          },
        },
      },
      { value: { [nameUrl]: { value: [{ value: "Acme", metadata: text }] } } },
      /* A number given as text, and a date that isn't one. */
      { value: { [employeesUrl]: { value: "12", metadata: text } } },
      { value: { [foundedUrl]: { value: "2026-13-01", metadata: text } } },
      {
        value: {
          "https://example.com/@acme/types/property-type/unknown/": {
            value: "Acme",
            metadata: text,
          },
        },
      },
      {
        value: {
          [nameUrl]: { value: "Acme", metadata: { dataTypeId: "text" } },
        },
      },
      [],
    ];

    for (const properties of unreadable) {
      expect(readPropertiesForm(properties, getValueKind)).toBeNull();
    }
  });
});

describe("readPatchesForm", () => {
  it("can't show patches it didn't make", () => {
    const property = { value: "Acme", metadata: { dataTypeId: textId } };
    const unreadable = [
      /* Replacing fails when the entity doesn't have the property, so the rows never make it. */
      [{ op: "replace", path: [nameUrl], property }],
      [{ op: "add", path: [nameUrl, 0], property }],
      [
        {
          op: "add",
          path: [nameUrl],
          property: { value: "Acme", metadata: {} },
        },
      ],
      [
        { op: "add", path: [nameUrl], property },
        { op: "remove", path: [nameUrl] },
      ],
      [{ op: "remove", path: ["https://example.com/other/"] }],
      { op: "remove", path: [nameUrl] },
    ];

    for (const patches of unreadable) {
      expect(readPatchesForm(patches, getValueKind)).toBeNull();
    }
  });
});

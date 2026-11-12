import { readdir } from "node:fs/promises";

import { beforeAll, describe, expect, it, vi } from "vitest";

import { createConversionFunction } from "@local/hash-isomorphic-utils/data-types";
import {
  blockProtocolDataTypes,
  systemDataTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { slugifyTypeTitle } from "@local/hash-isomorphic-utils/slugify-type-title";

import { createSystemDataTypeIfNotExists } from "../util";
import migrate from "./034-add-si-unit-data-types.migration";

import type { MigrationFunction } from "../types";
import type {
  BaseUrl,
  Conversions,
  DataType,
  DataTypeWithMetadata,
} from "@blockprotocol/type-system";

vi.mock("../util", () => ({
  createSystemDataTypeIfNotExists: vi.fn(),
}));

const seeded = new Map<
  string,
  { schema: DataType; conversions: Record<BaseUrl, Conversions> }
>();

beforeAll(async () => {
  vi.mocked(createSystemDataTypeIfNotExists).mockImplementation(
    async (_context, _authentication, { dataTypeDefinition, conversions }) => {
      const baseUrl =
        `https://hash.ai/@h/types/data-type/${slugifyTypeTitle(dataTypeDefinition.title)}/` as BaseUrl;
      const schema: DataType = {
        ...dataTypeDefinition,
        $schema:
          "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
        $id: `${baseUrl}v/1`,
        kind: "dataType",
      };
      expect(seeded.has(schema.title), `Duplicate title: ${schema.title}`).toBe(
        false,
      );
      seeded.set(schema.title, { schema, conversions });
      return {
        schema,
        metadata: { recordId: { baseUrl } },
      } as DataTypeWithMetadata;
    },
  );

  await migrate({
    context: {} as Parameters<MigrationFunction>[0]["context"],
    authentication: {} as Parameters<MigrationFunction>[0]["authentication"],
    migrationState: {
      dataTypeVersions: {},
      propertyTypeVersions: {},
      entityTypeVersions: {},
    },
  });
});

const getSeeded = (title: string) => {
  const dataType = seeded.get(title);
  if (!dataType) {
    throw new Error(`Missing seeded data type: ${title}`);
  }
  return dataType;
};

const getConversion = (source: string, target: string) => {
  const baseUrl = getSeeded(target).schema.$id.replace(/v\/1$/, "") as BaseUrl;
  const conversion = getSeeded(source).conversions[baseUrl];
  if (!conversion) {
    throw new Error(`Missing conversion from ${source} to ${target}`);
  }
  return conversion;
};

describe("default SI data types", () => {
  it("has a unique migration number so every migration runs", async () => {
    const migrationFiles = (
      await readdir(new URL(".", import.meta.url))
    ).filter((fileName) => fileName.endsWith(".migration.ts"));
    const migrationNumbers = migrationFiles.map(
      (fileName) => fileName.split("-")[0],
    );
    expect(new Set(migrationNumbers).size).toBe(migrationNumbers.length);
  });

  it("covers the seven base units and all 22 specially named derived units", () => {
    const titles = new Set([
      ...[
        systemDataTypes.meters,
        systemDataTypes.kilograms,
        systemDataTypes.second,
        systemDataTypes.hertz,
        systemDataTypes.watts,
      ].map(({ title }) => title),
      ...seeded.keys(),
    ]);
    const baseUnits = [
      "Meters",
      "Kilograms",
      "Second",
      "Amperes",
      "Kelvins",
      "Moles",
      "Candelas",
    ];
    const derivedUnits = [
      "Radians",
      "Steradians",
      "Hertz",
      "Newtons",
      "Pascals",
      "Joules",
      "Watts",
      "Coulombs",
      "Volts",
      "Farads",
      "Ohms",
      "Siemens",
      "Webers",
      "Teslas",
      "Henries",
      "Degrees Celsius",
      "Lumens",
      "Lux",
      "Becquerels",
      "Grays",
      "Sieverts",
      "Katals",
    ];
    for (const title of [...baseUnits, ...derivedUnits]) {
      expect(titles.has(title), title).toBe(true);
    }
  });

  it("covers the compound units in SI brochure tables 5 and 6", () => {
    const titles = [
      "Square Metres",
      "Cubic Metres",
      "Meters per Second",
      "Meters per Second Squared",
      "Reciprocal Meters",
      "Kilograms per Cubic Meter",
      "Kilograms per Square Meter",
      "Cubic Meters per Kilogram",
      "Amperes per Square Meter",
      "Amperes per Meter",
      "Moles per Cubic Meter",
      "Candelas per Square Meter",
      "Pascal Seconds",
      "Newton Meters",
      "Newtons per Meter",
      "Radians per Second",
      "Radians per Second Squared",
      "Watts per Square Meter",
      "Joules per Kelvin",
      "Joules per Kilogram Kelvin",
      "Joules per Kilogram",
      "Watts per Meter Kelvin",
      "Joules per Cubic Meter",
      "Volts per Meter",
      "Coulombs per Cubic Meter",
      "Coulombs per Square Meter",
      "Farads per Meter",
      "Henries per Meter",
      "Joules per Mole",
      "Joules per Mole Kelvin",
      "Coulombs per Kilogram",
      "Grays per Second",
      "Watts per Steradian",
      "Watts per Square Meter Steradian",
      "Katals per Cubic Meter",
    ];
    for (const title of titles) {
      const existing = ["Square Metres", "Cubic Metres"].includes(title);
      if (existing) {
        expect(
          Object.values(systemDataTypes).some((type) => type.title === title),
        ).toBe(true);
      } else {
        expect(getSeeded(title).schema.abstract, title).not.toBe(true);
      }
    }
  });

  it("registers every seeded type with its generated identifier and description", () => {
    for (const { schema } of seeded.values()) {
      const registered = Object.values(systemDataTypes).find(
        ({ title }) => title === schema.title,
      );
      expect(registered, schema.title).toMatchObject({
        dataTypeId: schema.$id,
        title: schema.title,
        description: schema.description,
      });
    }
  });

  it("creates parents and conversion targets before their dependents", () => {
    const available = new Map<string, DataType>();
    for (const { schema, conversions } of seeded.values()) {
      for (const parent of schema.allOf ?? []) {
        if (parent.$ref !== blockProtocolDataTypes.number.dataTypeId) {
          expect(available.get(parent.$ref)?.abstract, schema.title).toBe(true);
        }
      }
      for (const baseUrl of Object.keys(conversions)) {
        const target = available.get(`${baseUrl}v/1`);
        expect(target, schema.title).toBeDefined();
        expect(target?.allOf, schema.title).toEqual(schema.allOf);
      }
      if (!schema.abstract) {
        expect(schema.label?.right, schema.title).toBeTruthy();
      }
      available.set(schema.$id, schema);
    }
  });

  it.each([
    ["Becquerels", "Hertz"],
    ["Grays", "Sieverts"],
    ["Newton Meters", "Joules"],
    ["Radians", "Steradians"],
  ])("keeps %s separate from %s", (left, right) => {
    const leftType = getSeeded(left);
    expect(leftType.conversions).not.toHaveProperty(
      `https://hash.ai/@h/types/data-type/${slugifyTypeTitle(right)}/`,
    );
    if (seeded.has(right)) {
      expect(leftType.schema.allOf).not.toEqual(getSeeded(right).schema.allOf);
    }
  });
});

describe("SI unit conversions", () => {
  it.each([
    ["Degrees Celsius", "Kelvins", 0, 273.15],
    ["Degrees Celsius", "Kelvins", -273.15, 0],
    ["Degrees Celsius", "Kelvins", 100, 373.15],
    ["Degrees Fahrenheit", "Kelvins", 32, 273.15],
    ["Degrees Fahrenheit", "Kelvins", 212, 373.15],
    ["Degrees Fahrenheit", "Kelvins", -459.67, 0],
    ["Radians", "Degree", Math.PI, 180],
    ["Kilometers per Hour", "Meters per Second", 36, 10],
    ["Milliamperes", "Amperes", 1000, 1],
    ["Micromoles", "Moles", 1000000, 1],
    ["Kilonewtons", "Newtons", 1, 1000],
    ["Bars", "Pascals", 1, 100000],
    ["Standard Atmospheres", "Pascals", 1, 101325],
    ["Kilowatt Hours", "Joules", 1, 3600000],
    ["Milliampere Hours", "Coulombs", 1000, 3600],
    ["Picofarads", "Farads", 1000000000000, 1],
    ["Grams per Cubic Centimeter", "Kilograms per Cubic Meter", 1, 1000],
    ["Moles per Litre", "Moles per Cubic Meter", 1, 1000],
    ["Millipascal Seconds", "Pascal Seconds", 1000, 1],
    ["Microsieverts", "Sieverts", 1000000, 1],
  ])("converts %s to %s and back", (source, target, input, expected) => {
    const conversion = getConversion(source, target);
    expect(createConversionFunction([conversion.to])(input)).toBeCloseTo(
      expected,
      10,
    );
    expect(createConversionFunction([conversion.from])(expected)).toBeCloseTo(
      input,
      10,
    );
  });

  it("composes Fahrenheit and Celsius conversions through their shared Kelvin target", () => {
    const fahrenheit = getConversion("Degrees Fahrenheit", "Kelvins");
    const celsius = getConversion("Degrees Celsius", "Kelvins");
    expect(createConversionFunction([fahrenheit.to, celsius.from])(-40)).toBe(
      -40,
    );
    expect(createConversionFunction([celsius.to, fahrenheit.from])(100)).toBe(
      212,
    );
  });

  it("round-trips every conversion with the application evaluator", () => {
    for (const { schema, conversions } of seeded.values()) {
      for (const conversion of Object.values(conversions)) {
        for (const value of [0, 1, 123.456]) {
          expect(
            createConversionFunction([conversion.to, conversion.from])(value),
            `${schema.title}: ${value}`,
          ).toBeCloseTo(value, 8);
        }
      }
    }
  });

  it("bounds temperature readings at absolute zero", () => {
    for (const [title, minimum] of [
      ["Kelvins", 0],
      ["Degrees Celsius", -273.15],
      ["Degrees Fahrenheit", -459.67],
    ] as const) {
      expect(getSeeded(title).schema).toMatchObject({ minimum });
    }
  });
});

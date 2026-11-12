import { readdir } from "node:fs/promises";

import { beforeAll, describe, expect, it, vi } from "vitest";

import { createConversionFunction } from "@local/hash-isomorphic-utils/data-types";
import {
  blockProtocolDataTypes,
  systemDataTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { slugifyTypeTitle } from "@local/hash-isomorphic-utils/slugify-type-title";

import migrate from "./034-add-si-unit-data-types.migration";
import { ensureUnitDataType } from "./034-add-si-unit-data-types/ensure-unit-data-type";

import type { MigrationFunction } from "../types";
import type {
  BaseUrl,
  Conversions,
  DataType,
  DataTypeWithMetadata,
} from "@blockprotocol/type-system";

vi.mock("./034-add-si-unit-data-types/ensure-unit-data-type", () => ({
  ensureUnitDataType: vi.fn(),
}));

const upgradedUnits = new Set([
  "Meters",
  "Millimeters",
  "Centimeters",
  "Kilometers",
  "Inches",
  "Feet",
  "Yards",
  "Miles",
  "Kilograms",
  "Grams",
  "Metric Tonnes",
  "Pounds",
  "Second",
  "Millisecond",
  "Microsecond",
  "Minute",
  "Hour",
  "Day",
  "Week",
  "Month",
  "Year",
  "Hours",
  "Days",
  "Hertz",
  "Kilohertz",
  "Megahertz",
  "Gigahertz",
  "Watts",
  "Kilowatts",
  "Megawatts",
  "Gigawatts",
  "Square Metres",
  "Square Centimetres",
  "Square Feet",
  "Litres",
  "Millilitres",
  "Cubic Metres",
  "Cubic Feet",
]);

const seeded = new Map<
  string,
  { schema: DataType; conversions: Record<BaseUrl, Conversions> }
>();

beforeAll(async () => {
  vi.mocked(ensureUnitDataType).mockImplementation(
    async (_context, _authentication, { dataTypeDefinition, conversions }) => {
      const baseUrl =
        `https://hash.ai/@h/types/data-type/${slugifyTypeTitle(dataTypeDefinition.title)}/` as BaseUrl;
      const schema: DataType = {
        ...dataTypeDefinition,
        $schema:
          "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
        $id: `${baseUrl}v/${upgradedUnits.has(dataTypeDefinition.title) ? 2 : 1}`,
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
  const baseUrl = getSeeded(target).schema.$id.replace(
    /v\/\d+$/,
    "",
  ) as BaseUrl;
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

  it.each([
    "m",
    "g",
    "s",
    "A",
    "K",
    "mol",
    "cd",
    "rad",
    "sr",
    "Hz",
    "N",
    "Pa",
    "J",
    "W",
    "C",
    "V",
    "F",
    "Ω",
    "S",
    "Wb",
    "T",
    "H",
    "lm",
    "lx",
    "Bq",
    "Gy",
    "Sv",
    "kat",
    "A·h",
    "W·h",
    "L",
    "m²",
    "m³",
  ])("covers all 24 SI prefixes for %s", (symbol) => {
    const symbols = new Set(
      [...seeded.values()].map(({ schema }) => schema.label?.right),
    );
    for (const prefix of [
      "Q",
      "R",
      "Y",
      "Z",
      "E",
      "P",
      "T",
      "G",
      "M",
      "k",
      "h",
      "da",
      "d",
      "c",
      "m",
      "µ",
      "n",
      "p",
      "f",
      "a",
      "z",
      "y",
      "r",
      "q",
    ]) {
      expect(symbols.has(`${prefix}${symbol}`), `${prefix}${symbol}`).toBe(
        true,
      );
    }
  });

  it("preserves existing unit names and avoids double prefixes on kilograms", () => {
    for (const title of [
      "Microsecond",
      "Millisecond",
      "Millimeters",
      "Kilometers",
      "Kilograms",
      "Kilohms",
      "Megohms",
      "Square Centimetres",
      "Cubic Metres",
      "Millilitres",
    ]) {
      expect(getSeeded(title).schema.$id).toBe(
        Object.values(systemDataTypes).find((type) => type.title === title)
          ?.dataTypeId,
      );
    }
    expect(seeded.has("Microkilograms")).toBe(false);
    expect(seeded.has("Kiloohms")).toBe(false);
    expect(seeded.has("Megaohms")).toBe(false);
  });

  it("groups units by quantity and measurement system", () => {
    for (const [unit, system, quantity] of [
      ["Meters", "Length (Metric)", "Length"],
      ["Feet", "Length (Imperial)", "Length"],
      ["Pounds", "Mass (Imperial)", "Mass"],
      ["Short Tons", "Mass (US Customary)", "Mass"],
      ["Litres", "Volume (Metric)", "Volume"],
      ["Imperial Gallons", "Volume (Imperial)", "Volume"],
      ["US Liquid Gallons", "Volume (US Customary)", "Volume"],
      ["Degrees Fahrenheit", "Temperature (Imperial)", "Temperature"],
      ["Pound-Force Feet", "Torque (Imperial)", "Torque"],
      ["Amperes", "Electric Current (Metric)", "Electric Current"],
    ] as const) {
      expect(getSeeded(unit).schema.allOf).toContainEqual({
        $ref: getSeeded(system).schema.$id,
      });
      expect(getSeeded(system).schema).toMatchObject({
        abstract: true,
        allOf: [{ $ref: getSeeded(quantity).schema.$id }],
      });
    }
    for (const title of [
      "Electric Current (Imperial)",
      "Capacitance (Imperial)",
      "Duration (Imperial)",
    ]) {
      expect(seeded.has(title)).toBe(false);
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
        const target = [...available.values()].find((type) =>
          type.$id.startsWith(baseUrl),
        );
        expect(target, schema.title).toBeDefined();
        const quantityIds = (type: DataType) =>
          (type.allOf ?? []).flatMap(
            ({ $ref }) =>
              available.get($ref)?.allOf?.map((parent) => parent.$ref) ?? [],
          );
        expect(
          quantityIds(schema).some(
            (id) => target && quantityIds(target).includes(id),
          ),
          schema.title,
        ).toBe(true);
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
    ["Feet", "Meters", 1, 0.3048],
    ["Miles", "Meters", 1, 1609.344],
    ["Pounds", "Kilograms", 1, 0.45359237],
    ["Troy Ounces", "Kilograms", 1, 0.0311034768],
    ["Long Tons", "Kilograms", 1, 1016.0469088],
    ["Short Tons", "Kilograms", 1, 907.18474],
    ["Acres", "Square Metres", 1, 4046.8564224],
    ["Cubic Inches", "Litres", 1, 0.016387064],
    ["Imperial Gallons", "Litres", 1, 4.54609],
    ["US Liquid Gallons", "Litres", 1, 3.785411784],
    ["US Dry Gallons", "Litres", 1, 4.40488377086],
    ["US Cups", "Litres", 1, 0.2365882365],
    ["Pounds-Force", "Newtons", 1, 4.4482216152605],
    ["Pounds-Force per Square Inch", "Pascals", 1, 6894.757293168361],
    ["Mechanical Horsepower", "Watts", 1, 745.6998715822702],
    ["British Thermal Units (IT)", "Joules", 1, 1055.05585262],
    [
      "British Thermal Units (IT) per Pound Degree Rankine",
      "Joules per Kilogram Kelvin",
      1,
      4186.8,
    ],
    ["Pound-Force Feet", "Newton Meters", 1, 1.3558179483314],
    [
      "Pounds per Cubic Foot",
      "Kilograms per Cubic Meter",
      1,
      16.01846337396014,
    ],
    ["Foot-Candles", "Lux", 1, 10.763910416709722],
    ["Degrees Rankine", "Kelvins", 491.67, 273.15],
    ["Hours", "Second", 1, 3600],
    ["Days", "Second", 1, 86400],
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
    ["Kiloampere Hours", "Coulombs", 1, 3600000],
    ["Microampere Hours", "Coulombs", 1000000, 3600],
    ["Millicoulombs", "Coulombs", 1000, 1],
    ["Megawatt Hours", "Joules", 1, 3600000000],
    ["Milligrams", "Kilograms", 1000000, 1],
    ["Megagrams", "Kilograms", 1, 1000],
    ["Nanosecond", "Second", 1000000000, 1],
    ["Gigahertz", "Hertz", 1, 1000000000],
    ["Microkelvins", "Kelvins", 1000000, 1],
    ["Square Millimetres", "Square Metres", 1000000, 1],
    ["Square Kilometres", "Square Metres", 1, 1000000],
    ["Cubic Centimetres", "Litres", 1000, 1],
    ["Cubic Millimetres", "Litres", 1000000, 1],
    ["Microlitres", "Litres", 1000000, 1],
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

  it.each([
    ["Feet", "Centimeters", "Meters", 1, 30.48],
    [
      "Miles per Hour",
      "Kilometers per Hour",
      "Meters per Second",
      60,
      96.56064,
    ],
    ["Ounces", "Grams", "Kilograms", 1, 28.349523125],
    ["Imperial Gallons", "US Liquid Gallons", "Litres", 1, 1.20094992550485],
    ["Imperial Pints", "US Liquid Pints", "Litres", 1, 1.20094992550485],
    [
      "Imperial Fluid Ounces",
      "US Fluid Ounces",
      "Litres",
      1,
      0.9607599404038839,
    ],
    ["Pound-Force Feet", "Pound-Force Inches", "Newton Meters", 1, 12],
    ["Days", "Hour", "Second", 1, 24],
  ])(
    "converts %s to %s through %s",
    (source, target, reference, value, expected) => {
      const sourceConversion = getConversion(source, reference);
      const targetConversion = getConversion(target, reference);
      expect(
        createConversionFunction([sourceConversion.to, targetConversion.from])(
          value,
        ),
      ).toBeCloseTo(expected, 10);
      expect(
        createConversionFunction([targetConversion.to, sourceConversion.from])(
          expected,
        ),
      ).toBeCloseTo(value, 10);
    },
  );

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

  it("round-trips every conversion at magnitudes supported by the application evaluator", () => {
    for (const { schema, conversions } of seeded.values()) {
      for (const conversion of Object.values(conversions)) {
        const reverseMagnitude = Math.abs(
          createConversionFunction([conversion.from])(1),
        );
        const magnitude = Math.max(1, reverseMagnitude);
        for (const value of [0, magnitude, 123.456 * magnitude]) {
          const result = createConversionFunction([
            conversion.to,
            conversion.from,
          ])(value);
          if (value === 0) {
            expect(result, schema.title).toBeCloseTo(0, 8);
          } else {
            expect(result / value, `${schema.title}: ${value}`).toBeCloseTo(
              1,
              12,
            );
          }
        }
      }
    }
  });

  it.each([
    ["Quettaamperes", "Amperes", 1, 1e30],
    ["Ronnaamperes", "Amperes", 1, 1e27],
    ["Rontoamperes", "Amperes", 1e27, 1],
    ["Quectoamperes", "Amperes", 1e30, 1],
    ["Quectograms", "Kilograms", 1e33, 1],
    ["Square Quectometres", "Square Metres", 1e60, 1],
    ["Cubic Quectometres", "Litres", 1e87, 1],
    ["Cubic Quettametres", "Litres", 1, 1e93],
  ])(
    "converts %s at supported magnitudes",
    (source, target, input, expected) => {
      const conversion = getConversion(source, target);
      const actual = createConversionFunction([conversion.to])(input);
      expect(actual / expected).toBeCloseTo(1, 12);
      expect(
        createConversionFunction([conversion.from])(expected) / input,
      ).toBeCloseTo(1, 12);
    },
  );

  it("composes charge and volume prefixes through their reference units", () => {
    const kiloampereHours = getConversion("Kiloampere Hours", "Coulombs");
    const milliampereHours = getConversion("Milliampere Hours", "Coulombs");
    expect(
      createConversionFunction([kiloampereHours.to, milliampereHours.from])(1),
    ).toBeCloseTo(1000000, 6);

    const cubicCentimetres = getConversion("Cubic Centimetres", "Litres");
    const millilitres = getConversion("Millilitres", "Litres");
    expect(
      createConversionFunction([cubicCentimetres.to, millilitres.from])(1),
    ).toBe(1);
  });

  it("bounds temperature readings at absolute zero", () => {
    for (const [title, minimum] of [
      ["Kelvins", 0],
      ["Degrees Celsius", -273.15],
      ["Degrees Fahrenheit", -459.67],
      ["Millikelvins", 0],
      ["Quectokelvins", 0],
    ] as const) {
      expect(getSeeded(title).schema).toMatchObject({ minimum });
    }
  });
});

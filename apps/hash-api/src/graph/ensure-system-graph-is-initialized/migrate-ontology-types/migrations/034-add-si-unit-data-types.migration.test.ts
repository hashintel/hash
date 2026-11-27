import { readdir } from "node:fs/promises";

import { beforeAll, describe, expect, it, vi } from "vitest";

import { createConversionFunction } from "@local/hash-isomorphic-utils/data-types";
import {
  blockProtocolDataTypes,
  systemDataTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { slugifyTypeTitle } from "@local/hash-isomorphic-utils/slugify-type-title";

import migrate from "./034-add-si-unit-data-types.migration";
import { ensureUnitDataType } from "./shared/ensure-unit-data-type";

import type { MigrationFunction } from "../types";
import type {
  BaseUrl,
  Conversions,
  DataType,
  DataTypeWithMetadata,
} from "@blockprotocol/type-system";

vi.mock("./shared/ensure-unit-data-type", () => ({
  ensureUnitDataType: vi.fn(),
}));

const upgradedUnits = new Set(
  [
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
    // Quantities seeded before 034 without a plural title
    "Length",
    "Mass",
    "Duration",
    "Frequency",
    "Power",
    "Area",
    "Volume",
  ].map(
    (title) => `https://hash.ai/@h/types/data-type/${slugifyTypeTitle(title)}/`,
  ),
);

const previousTitles: Record<string, string> = {
  angle: "Angle",
  area: "Area",
  centimeters: "Centimeters",
  "cubic-feet": "Cubic Feet",
  "cubic-metres": "Cubic Metres",
  day: "Day",
  days: "Days",
  degree: "Degree",
  duration: "Duration",
  feet: "Feet",
  "feet-per-minute": "Feet per Minute",
  frequency: "Frequency",
  gigahertz: "Gigahertz",
  gigawatts: "Gigawatts",
  grams: "Grams",
  hertz: "Hertz",
  hour: "Hour",
  hours: "Hours",
  inches: "Inches",
  kilograms: "Kilograms",
  kilohertz: "Kilohertz",
  kilometers: "Kilometers",
  "kilometers-per-hour": "Kilometers per Hour",
  kilowatts: "Kilowatts",
  length: "Length",
  litres: "Litres",
  mass: "Mass",
  megahertz: "Megahertz",
  megawatts: "Megawatts",
  meters: "Meters",
  "meters-per-second": "Meters per Second",
  "metric-tonnes": "Metric Tonnes",
  microsecond: "Microsecond",
  miles: "Miles",
  millilitres: "Millilitres",
  millimeters: "Millimeters",
  millisecond: "Millisecond",
  minute: "Minute",
  month: "Month",
  pounds: "Pounds",
  power: "Power",
  second: "Second",
  speed: "Speed",
  "square-centimetres": "Square Centimetres",
  "square-feet": "Square Feet",
  "square-metres": "Square Metres",
  volume: "Volume",
  watts: "Watts",
  week: "Week",
  yards: "Yards",
  year: "Year",
};

const seeded = new Map<
  string,
  { schema: DataType; conversions: Record<BaseUrl, Conversions> }
>();

beforeAll(async () => {
  vi.mocked(ensureUnitDataType).mockImplementation(
    async (
      _context,
      _authentication,
      { dataTypeDefinition, dataTypeBaseUrl, conversions },
    ) => {
      const baseUrl =
        dataTypeBaseUrl ??
        (`https://hash.ai/@h/types/data-type/${slugifyTypeTitle(dataTypeDefinition.title)}/` as BaseUrl);
      const schema: DataType = {
        ...dataTypeDefinition,
        $schema:
          "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
        $id: `${baseUrl}v/${upgradedUnits.has(baseUrl) ? 2 : 1}`,
        kind: "dataType",
      };
      expect(seeded.has(baseUrl), `Duplicate identifier: ${baseUrl}`).toBe(
        false,
      );
      seeded.set(baseUrl, { schema, conversions });
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

const hasSeeded = (identifierTitle: string) =>
  seeded.has(
    `https://hash.ai/@h/types/data-type/${slugifyTypeTitle(identifierTitle)}/`,
  );

const getSeeded = (identifierTitle: string) => {
  const dataType = seeded.get(
    `https://hash.ai/@h/types/data-type/${slugifyTypeTitle(identifierTitle)}/`,
  );
  if (!dataType) {
    throw new Error(`Missing seeded data type: ${identifierTitle}`);
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

  it("provides a plural title for every quantity, system group and unit", () => {
    expect(seeded.size).toBe(1167);
    for (const { schema } of seeded.values()) {
      expect(schema.titlePlural, schema.title).toBeTruthy();
    }
  });

  it.each([
    ["Meters", "Meters", "Meters"],
    ["Feet", "Feet", "Feet"],
    ["Square Inch", "Square Inch", "Square Inches"],
    ["Henry per Meter", "Henry per Meter", "Henries per Meter"],
    ["Microhenry", "Microhenry", "Microhenries"],
    ["Darcy", "Darcy", "Darcies"],
    ["Quettasecond", "Quettasecond", "Quettaseconds"],
    ["Kilosiemens", "Kilosiemens", "Kilosiemens"],
    ["Hertz", "Hertz", "Hertz"],
    ["Ampere Hour", "Ampere Hour", "Ampere Hours"],
    [
      "Pound-Force Second per Square Foot",
      "Pound-Force Second per Square Foot",
      "Pound-Force Seconds per Square Foot",
    ],
    ["Amount of Substance", "Amount of Substance", "Amounts of Substance"],
    ["Length (Imperial)", "Length (Imperial)", "Lengths (Imperial)"],
    ["Mole per Liter", "Mole per Liter", "Moles per Liter"],
    ["Cubic Centimeter", "Cubic Centimeter", "Cubic Centimeters"],
    ["Kiloliter", "Kiloliter", "Kiloliters"],
    ["Square Kilometer", "Square Kilometer", "Square Kilometers"],
    ["Litres", "Litres", "Litres"],
    ["Square Metres", "Square Metres", "Square Metres"],
  ])(
    "keeps the %s identifier with matching singular and plural names",
    (identifierTitle, title, titlePlural) => {
      expect(getSeeded(identifierTitle).schema).toMatchObject({
        title,
        titlePlural,
      });
    },
  );

  it.each([
    ["Hour", "Hours"],
    ["Day", "Days"],
  ])("keeps both existing %s identifiers", (singular, plural) => {
    const original = getSeeded(singular);
    const legacy = getSeeded(plural);
    expect(original.schema.$id).not.toBe(legacy.schema.$id);
    expect(original.schema).toMatchObject({
      title: singular,
      titlePlural: plural,
    });
    expect(legacy.schema).toMatchObject({ title: plural, titlePlural: plural });
  });

  it("derives the identifier of every new type from its title", () => {
    for (const [baseUrl, { schema }] of seeded) {
      const previousTitle = previousTitles[baseUrl.split("/").at(-2) ?? ""];
      if (previousTitle) {
        expect(schema.title, baseUrl).toBe(previousTitle);
      } else {
        expect(baseUrl).toBe(
          `https://hash.ai/@h/types/data-type/${slugifyTypeTitle(schema.title)}/`,
        );
      }
    }
  });

  it("describes fixed durations without migration history", () => {
    expect(getSeeded("Month").schema.description).toBe(
      "A mean duration of 2,629,800 seconds. Calendar months vary in length.",
    );
    expect(getSeeded("Year").schema.description).not.toContain(
      "preserving the existing fixed",
    );
  });

  it("covers the seven base units and all 22 specially named derived units", () => {
    const baseUnits = [
      "Meters",
      "Kilograms",
      "Second",
      "Ampere",
      "Kelvin",
      "Mole",
      "Candela",
    ];
    const derivedUnits = [
      "Radian",
      "Steradian",
      "Hertz",
      "Newton",
      "Pascal",
      "Joule",
      "Watts",
      "Coulomb",
      "Volt",
      "Farad",
      "Ohm",
      "Siemens",
      "Weber",
      "Tesla",
      "Henry",
      "Degree Celsius",
      "Lumen",
      "Lux",
      "Becquerel",
      "Gray",
      "Sievert",
      "Katal",
    ];
    for (const title of [...baseUnits, ...derivedUnits]) {
      expect(hasSeeded(title), title).toBe(true);
    }
  });

  it("covers the compound units in SI brochure tables 5 and 6", () => {
    const titles = [
      "Square Metres",
      "Cubic Metres",
      "Meters per Second",
      "Meter per Second Squared",
      "Reciprocal Meter",
      "Kilogram per Cubic Meter",
      "Kilogram per Square Meter",
      "Cubic Meter per Kilogram",
      "Ampere per Square Meter",
      "Ampere per Meter",
      "Mole per Cubic Meter",
      "Candela per Square Meter",
      "Pascal Second",
      "Newton Meter",
      "Newton per Meter",
      "Radian per Second",
      "Radian per Second Squared",
      "Watt per Square Meter",
      "Joule per Kelvin",
      "Joule per Kilogram Kelvin",
      "Joule per Kilogram",
      "Watt per Meter Kelvin",
      "Joule per Cubic Meter",
      "Volt per Meter",
      "Coulomb per Cubic Meter",
      "Coulomb per Square Meter",
      "Farad per Meter",
      "Henry per Meter",
      "Joule per Mole",
      "Joule per Mole Kelvin",
      "Coulomb per Kilogram",
      "Gray per Second",
      "Watt per Steradian",
      "Watt per Square Meter Steradian",
      "Katal per Cubic Meter",
    ];
    for (const title of titles) {
      expect(getSeeded(title).schema.abstract, title).not.toBe(true);
    }
  });

  it("registers every seeded type with its generated identifier and description", () => {
    for (const { schema } of seeded.values()) {
      const registered = Object.values(systemDataTypes).find(
        ({ dataTypeId }) => dataTypeId === schema.$id,
      );
      expect(registered, schema.title).toMatchObject({
        dataTypeId: schema.$id,
        title: schema.title,
        titlePlural: schema.titlePlural,
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

  it("preserves existing unit identifiers and avoids double prefixes on kilograms", () => {
    for (const title of [
      "Microsecond",
      "Millisecond",
      "Millimeters",
      "Kilometers",
      "Kilograms",
      "Kilohm",
      "Megohm",
      "Square Centimetres",
      "Cubic Metres",
      "Millilitres",
    ]) {
      expect(getSeeded(title).schema.$id).toBe(
        Object.values(systemDataTypes).find(
          (type) =>
            type.dataTypeBaseUrl ===
            `https://hash.ai/@h/types/data-type/${slugifyTypeTitle(title)}/`,
        )?.dataTypeId,
      );
    }
    expect(hasSeeded("Microkilograms")).toBe(false);
    expect(hasSeeded("Kiloohms")).toBe(false);
    expect(hasSeeded("Megaohms")).toBe(false);
  });

  it("groups units by quantity and measurement system", () => {
    for (const [unit, system, quantity] of [
      ["Meters", "Length (Metric)", "Length"],
      ["Feet", "Length (Imperial)", "Length"],
      ["Pounds", "Mass (Imperial)", "Mass"],
      ["Short Ton", "Mass (US Customary)", "Mass"],
      ["Litres", "Volume (Metric)", "Volume"],
      ["Imperial Gallon", "Volume (Imperial)", "Volume"],
      ["US Liquid Gallon", "Volume (US Customary)", "Volume"],
      ["Degree Fahrenheit", "Temperature (Imperial)", "Temperature"],
      ["Pound-Force Foot", "Torque (Imperial)", "Torque"],
      ["Ampere", "Electric Current (Metric)", "Electric Current"],
      [
        "Henry per Meter",
        "Magnetic Permeability (Metric)",
        "Magnetic Permeability",
      ],
      [
        "Henry per Foot",
        "Magnetic Permeability (Imperial)",
        "Magnetic Permeability",
      ],
      ["Darcy", "Fluid Permeability (Metric)", "Fluid Permeability"],
      ["Square Feet", "Fluid Permeability (Imperial)", "Fluid Permeability"],
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
      expect(hasSeeded(title)).toBe(false);
    }
  });

  it("reuses square-length units for fluid permeability without merging the quantities", () => {
    for (const title of [
      "Square Metres",
      "Square Centimetres",
      "Square Millimeter",
      "Square Micrometer",
      "Square Feet",
      "Square Inch",
    ]) {
      const system = ["Square Feet", "Square Inch"].includes(title)
        ? "Imperial"
        : "Metric";
      expect(getSeeded(title).schema.allOf).toEqual([
        { $ref: getSeeded(`Area (${system})`).schema.$id },
        { $ref: getSeeded(`Fluid Permeability (${system})`).schema.$id },
      ]);
    }
    for (const title of ["Darcy", "Millidarcy", "Microdarcy", "Nanodarcy"]) {
      expect(getSeeded(title).schema.allOf).toEqual([
        { $ref: getSeeded("Fluid Permeability (Metric)").schema.$id },
      ]);
    }
    expect(hasSeeded("Permeability")).toBe(false);
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
    ["Becquerel", "Hertz"],
    ["Gray", "Sievert"],
    ["Newton Meter", "Joule"],
    ["Radian", "Steradian"],
    ["Darcy", "Henry per Meter"],
  ])("keeps %s separate from %s", (left, right) => {
    const leftType = getSeeded(left);
    expect(leftType.conversions).not.toHaveProperty(
      `https://hash.ai/@h/types/data-type/${slugifyTypeTitle(right)}/`,
    );
    if (hasSeeded(right)) {
      expect(leftType.schema.allOf).not.toEqual(getSeeded(right).schema.allOf);
    }
  });
});

describe("SI unit conversions", () => {
  it.each([
    ["Darcy", 1e-12],
    ["Millidarcy", 1e-15],
    ["Microdarcy", 1e-18],
    ["Nanodarcy", 1e-21],
  ])("converts %s to square metres with relative accuracy", (title, scale) => {
    const conversion = getConversion(title, "Square Metres");
    const expected = scale / 1.01325;
    expect(createConversionFunction([conversion.to])(1) / expected).toBeCloseTo(
      1,
      12,
    );
    expect(createConversionFunction([conversion.from])(expected)).toBeCloseTo(
      1,
      12,
    );
  });

  it.each([
    ["Feet", "Meters", 1, 0.3048],
    ["Miles", "Meters", 1, 1609.344],
    ["Pounds", "Kilograms", 1, 0.45359237],
    ["Troy Ounce", "Kilograms", 1, 0.0311034768],
    ["Long Ton", "Kilograms", 1, 1016.0469088],
    ["Short Ton", "Kilograms", 1, 907.18474],
    ["Acre", "Square Metres", 1, 4046.8564224],
    ["Cubic Inch", "Litres", 1, 0.016387064],
    ["Imperial Gallon", "Litres", 1, 4.54609],
    ["US Liquid Gallon", "Litres", 1, 3.785411784],
    ["US Dry Gallon", "Litres", 1, 4.40488377086],
    ["US Cup", "Litres", 1, 0.2365882365],
    ["Pound-Force", "Newton", 1, 4.4482216152605],
    ["Pound-Force per Square Inch", "Pascal", 1, 6894.757293168361],
    ["Mechanical Horsepower", "Watts", 1, 745.6998715822702],
    ["British Thermal Unit (IT)", "Joule", 1, 1055.05585262],
    [
      "British Thermal Unit (IT) per Pound Degree Rankine",
      "Joule per Kilogram Kelvin",
      1,
      4186.8,
    ],
    ["Pound-Force Foot", "Newton Meter", 1, 1.3558179483314],
    ["Pound per Cubic Foot", "Kilogram per Cubic Meter", 1, 16.01846337396014],
    ["Foot-Candle", "Lux", 1, 10.763910416709722],
    ["Degree Rankine", "Kelvin", 491.67, 273.15],
    ["Hours", "Second", 1, 3600],
    ["Days", "Second", 1, 86400],
    ["Degree Celsius", "Kelvin", 0, 273.15],
    ["Degree Celsius", "Kelvin", -273.15, 0],
    ["Degree Celsius", "Kelvin", 100, 373.15],
    ["Degree Fahrenheit", "Kelvin", 32, 273.15],
    ["Degree Fahrenheit", "Kelvin", 212, 373.15],
    ["Degree Fahrenheit", "Kelvin", -459.67, 0],
    ["Radian", "Degree", Math.PI, 180],
    ["Kilometers per Hour", "Meters per Second", 36, 10],
    ["Milliampere", "Ampere", 1000, 1],
    ["Micromole", "Mole", 1000000, 1],
    ["Kilonewton", "Newton", 1, 1000],
    ["Bar", "Pascal", 1, 100000],
    ["Standard Atmosphere", "Pascal", 1, 101325],
    ["Kilowatt Hour", "Joule", 1, 3600000],
    ["Milliampere Hour", "Coulomb", 1000, 3600],
    ["Picofarad", "Farad", 1000000000000, 1],
    ["Gram per Cubic Centimeter", "Kilogram per Cubic Meter", 1, 1000],
    ["Mole per Liter", "Mole per Cubic Meter", 1, 1000],
    ["Millipascal Second", "Pascal Second", 1000, 1],
    ["Microsievert", "Sievert", 1000000, 1],
    ["Kiloampere Hour", "Coulomb", 1, 3600000],
    ["Microampere Hour", "Coulomb", 1000000, 3600],
    ["Millicoulomb", "Coulomb", 1000, 1],
    ["Megawatt Hour", "Joule", 1, 3600000000],
    ["Milligram", "Kilograms", 1000000, 1],
    ["Megagram", "Kilograms", 1, 1000],
    ["Nanosecond", "Second", 1000000000, 1],
    ["Gigahertz", "Hertz", 1, 1000000000],
    ["Microkelvin", "Kelvin", 1000000, 1],
    ["Square Millimeter", "Square Metres", 1000000, 1],
    ["Square Kilometer", "Square Metres", 1, 1000000],
    ["Cubic Centimeter", "Litres", 1000, 1],
    ["Cubic Millimeter", "Litres", 1000000, 1],
    ["Microliter", "Litres", 1000000, 1],
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
    ["Mile per Hour", "Kilometers per Hour", "Meters per Second", 60, 96.56064],
    ["Ounce", "Grams", "Kilograms", 1, 28.349523125],
    ["Imperial Gallon", "US Liquid Gallon", "Litres", 1, 1.20094992550485],
    ["Imperial Pint", "US Liquid Pint", "Litres", 1, 1.20094992550485],
    ["Imperial Fluid Ounce", "US Fluid Ounce", "Litres", 1, 0.9607599404038839],
    ["Pound-Force Foot", "Pound-Force Inch", "Newton Meter", 1, 12],
    ["Days", "Hour", "Second", 1, 24],
    ["Darcy", "Millidarcy", "Square Metres", 1, 1000],
    ["Darcy", "Square Feet", "Square Metres", 1e12, 1 / 1.01325 / 0.09290304],
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

  it("converts darcies and square micrometres within the existing evaluator precision", () => {
    const darcies = getConversion("Darcy", "Square Metres");
    const squareMicrometres = getConversion(
      "Square Micrometer",
      "Square Metres",
    );
    expect(
      createConversionFunction([darcies.to, squareMicrometres.from])(1),
    ).toBeCloseTo(1 / 1.01325, 12);
    expect(
      createConversionFunction([squareMicrometres.to, darcies.from])(
        1 / 1.01325,
      ),
    ).toBeCloseTo(1, 7);
  });

  it("composes Fahrenheit and Celsius conversions through their shared Kelvin target", () => {
    const fahrenheit = getConversion("Degree Fahrenheit", "Kelvin");
    const celsius = getConversion("Degree Celsius", "Kelvin");
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
    ["Quettaampere", "Ampere", 1, 1e30],
    ["Ronnaampere", "Ampere", 1, 1e27],
    ["Rontoampere", "Ampere", 1e27, 1],
    ["Quectoampere", "Ampere", 1e30, 1],
    ["Quectogram", "Kilograms", 1e33, 1],
    ["Square Quectometer", "Square Metres", 1e60, 1],
    ["Cubic Quectometer", "Litres", 1e87, 1],
    ["Cubic Quettameter", "Litres", 1, 1e93],
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
    const kiloampereHours = getConversion("Kiloampere Hour", "Coulomb");
    const milliampereHours = getConversion("Milliampere Hour", "Coulomb");
    expect(
      createConversionFunction([kiloampereHours.to, milliampereHours.from])(1),
    ).toBeCloseTo(1000000, 6);

    const cubicCentimetres = getConversion("Cubic Centimeter", "Litres");
    const millilitres = getConversion("Millilitres", "Litres");
    expect(
      createConversionFunction([cubicCentimetres.to, millilitres.from])(1),
    ).toBe(1);
  });

  it("bounds temperature readings at absolute zero", () => {
    for (const [title, minimum] of [
      ["Kelvin", 0],
      ["Degree Celsius", -273.15],
      ["Degree Fahrenheit", -459.67],
      ["Millikelvin", 0],
      ["Quectokelvin", 0],
    ] as const) {
      expect(getSeeded(title).schema).toMatchObject({ minimum });
    }
  });

  it("keeps offset temperature bounds off the shared ancestors", () => {
    for (const title of [
      "Temperature",
      "Temperature (Metric)",
      "Temperature (Imperial)",
    ]) {
      expect(getSeeded(title).schema).not.toHaveProperty("minimum");
    }
    for (const { schema, conversions } of seeded.values()) {
      if (
        !schema.title.endsWith("kelvin") &&
        schema.title !== "Kelvin" &&
        !["Degree Celsius", "Degree Fahrenheit", "Degree Rankine"].includes(
          schema.title,
        )
      ) {
        continue;
      }
      const minimum =
        "type" in schema && schema.type === "number" && "minimum" in schema
          ? schema.minimum
          : undefined;
      expect(minimum, schema.title).toBeDefined();
      const conversion = conversions[systemDataTypes.kelvin.dataTypeBaseUrl];
      if (conversion && minimum !== undefined) {
        expect(
          createConversionFunction([conversion.to])(minimum),
          schema.title,
        ).toBe(0);
        expect(
          createConversionFunction([conversion.from])(0),
          schema.title,
        ).toBe(minimum);
      }
    }
  });

  it("allows signed fractional values in reusable units", () => {
    for (const title of [
      "Meters",
      "Second",
      "Pascal",
      "Volt",
      "Ampere",
      "Joule",
      "Watts",
      "Radian",
      "Degree",
      "Newton Meter",
    ]) {
      const schema = getSeeded(title).schema;
      for (const bound of [
        "minimum",
        "maximum",
        "exclusiveMinimum",
        "exclusiveMaximum",
        "multipleOf",
        "enum",
      ]) {
        expect(schema, `${title}: ${bound}`).not.toHaveProperty(bound);
      }
    }
  });
});

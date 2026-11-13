import { beforeAll, describe, expect, it, vi } from "vitest";

import { createConversionFunction } from "@local/hash-isomorphic-utils/data-types";
import {
  blockProtocolDataTypes,
  systemDataTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { slugifyTypeTitle } from "@local/hash-isomorphic-utils/slugify-type-title";

import { siUnitGroups } from "./034-add-si-unit-data-types/si-unit-groups";
import migrate from "./035-add-common-unit-data-types.migration";
import { commonUnitGroups } from "./035-add-common-unit-data-types/common-unit-groups";
import { ensureUnitDataType } from "./shared/ensure-unit-data-type";

import type { MigrationFunction } from "../types";
import type {
  BaseUrl,
  ConversionDefinition,
  Conversions,
  DataType,
  DataTypeWithMetadata,
} from "@blockprotocol/type-system";

vi.mock("./shared/ensure-unit-data-type", () => ({
  ensureUnitDataType: vi.fn(),
}));

const seeded = new Map<
  string,
  { schema: DataType; conversions: Record<BaseUrl, Conversions> }
>();
const baseUrl = (title: string) =>
  `https://hash.ai/@h/types/data-type/${slugifyTypeTitle(title)}/` as BaseUrl;
const getSeeded = (title: string) => {
  const unit = seeded.get(title);
  if (!unit) {
    throw new Error(`Missing seeded type: ${title}`);
  }
  return unit;
};
const conversionPath = (
  source: string,
  target: string,
): ConversionDefinition[] | undefined => {
  const from = getSeeded(source).conversions;
  const to = getSeeded(target).conversions;
  const direct = from[baseUrl(target)];
  if (direct) {
    return [direct.to];
  }
  const reverse = to[baseUrl(source)];
  if (reverse) {
    return [reverse.from];
  }
  for (const reference of Object.keys(from) as BaseUrl[]) {
    const left = from[reference];
    const right = to[reference];
    if (left && right) {
      return [left.to, right.from];
    }
  }
  return undefined;
};
const convert = (source: string, target: string, value: number): number => {
  const path = conversionPath(source, target);
  if (!path) {
    throw new Error(`No conversion from ${source} to ${target}`);
  }
  return createConversionFunction(path)(value);
};

beforeAll(async () => {
  vi.mocked(ensureUnitDataType).mockImplementation(
    async (_context, _authentication, { dataTypeDefinition, conversions }) => {
      const url = baseUrl(dataTypeDefinition.title);
      const schema: DataType = {
        ...dataTypeDefinition,
        $id: `${url}v/1`,
        $schema:
          "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
        kind: "dataType",
      };
      expect(seeded.has(schema.title), schema.title).toBe(false);
      seeded.set(schema.title, { schema, conversions });
      return {
        schema,
        metadata: { recordId: { baseUrl: url } },
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

describe("common measurement units", () => {
  it("preserves the earlier catalogue and registers every type", () => {
    expect(seeded.size).toBe(1253);
    expect(commonUnitGroups).toHaveLength(73);
    const registry = new Map<string, BaseUrl>(
      Object.values(systemDataTypes).map((entry) => [
        entry.title,
        entry.dataTypeBaseUrl,
      ]),
    );
    const seededBaseUrls = new Set([...seeded.keys()].map(baseUrl));
    for (const { schema, conversions } of seeded.values()) {
      expect(registry.get(schema.title), schema.title).toBe(
        baseUrl(schema.title),
      );
      for (const target of Object.keys(conversions)) {
        expect(seededBaseUrls.has(target as BaseUrl), target).toBe(true);
      }
    }
    for (const previous of siUnitGroups) {
      const current = commonUnitGroups.find(
        (group) => group.title === previous.title,
      );
      expect(current?.description).toBe(previous.description);
      for (const unit of previous.units) {
        expect(
          current?.units.find(({ title }) => title === unit.title),
        ).toEqual(unit);
      }
    }
  });

  it.each([
    ["Curies", "Becquerels", 37e9],
    ["Rads", "Grays", 0.01],
    ["Rems", "Sieverts", 0.01],
    ["Nautical Miles", "Meters", 1852],
    ["Hectares", "Square Metres", 10000],
    ["Metric Carats", "Kilograms", 0.0002],
    ["Knots", "Meters per Second", 1852 / 3600],
    ["Millibars", "Pascals", 100],
    ["Torr", "Pascals", 101325 / 760],
    ["Millimeters of Mercury (Conventional)", "Pascals", 133.322387415],
    ["Inches of Water (Conventional)", "Pascals", 249.08891],
    ["Electronvolts", "Joules", 1.602176634e-19],
    ["Calories (Thermochemical)", "Joules", 4.184],
    ["Kilocalories (Thermochemical)", "Joules", 4184],
    ["Calories (IT)", "Joules", 4.1868],
    ["Kilocalories (IT)", "Joules", 4186.8],
    ["Therms (US)", "Joules", 105480400],
    ["Therms (EC)", "Joules", 105506000],
    ["Metric Horsepower", "Watts", 735.49875],
    ["Arcminutes", "Degree", 1 / 60],
    ["Arcseconds", "Degree", 1 / 3600],
    ["Revolutions", "Degree", 360],
    ["Revolutions per Second", "Radians per Second", 2 * Math.PI],
    ["Revolutions per Minute", "Radians per Second", Math.PI / 30],
    ["Standard Gravities", "Meters per Second Squared", 9.80665],
    ["Kilograms-Force", "Newtons", 9.80665],
    ["Poises", "Pascal Seconds", 0.1],
    ["Centipoises", "Pascal Seconds", 0.001],
    ["Milligrams per Decilitre", "Kilograms per Cubic Meter", 0.01],
    ["Milligrams per Litre", "Kilograms per Cubic Meter", 0.001],
    ["Grams per Litre", "Kilograms per Cubic Meter", 1],
    ["Foot-Lamberts", "Candelas per Square Meter", 1 / (Math.PI * 0.09290304)],
    ["Square Millimeters per Second", "Square Meters per Second", 1e-6],
    ["Stokes", "Square Meters per Second", 1e-4],
    ["Centistokes", "Square Meters per Second", 1e-6],
    ["Percentage", "One", 0.01],
    ["Parts per Million", "One", 1e-6],
    ["Parts per Billion", "One", 1e-9],
    ["Cubic Meters per Hour", "Cubic Meters per Second", 1 / 3600],
    ["Litres per Second", "Cubic Meters per Second", 0.001],
    ["Litres per Minute", "Cubic Meters per Second", 1 / 60000],
    ["US Gallons per Minute", "Cubic Meters per Second", 0.003785411784 / 60],
    ["Imperial Gallons per Minute", "Cubic Meters per Second", 0.00454609 / 60],
    ["Cubic Feet per Minute", "Cubic Meters per Second", 0.028316846592 / 60],
    ["Decibels", "Bels", 0.1],
  ] as const)(
    "converts %s to %s in both directions",
    (source, target, factor) => {
      for (const value of [-123.456, 1, 123.456]) {
        expect(convert(source, target, value) / (value * factor)).toBeCloseTo(
          1,
          12,
        );
        expect(convert(target, source, value * factor) / value).toBeCloseTo(
          1,
          12,
        );
      }
    },
  );

  it.each([
    ["Miles per US Gallon", 1.609344 / 3.785411784],
    ["Miles per Imperial Gallon", 1.609344 / 4.54609],
  ] as const)("converts fuel economy in %s", (title, factor) => {
    for (const value of [0, 0.1, 1, 25, 1000]) {
      expect(convert(title, "Kilometers per Litre", value)).toBeCloseTo(
        value * factor,
        10,
      );
      expect(
        convert("Kilometers per Litre", title, value * factor),
      ).toBeCloseTo(value, 10);
      expect(
        conversionPath(title, "Litres per 100 Kilometers"),
      ).toBeUndefined();
    }
  });

  it("converts across systems using shared references", () => {
    expect(convert("Nautical Miles", "Feet", 1)).toBeCloseTo(
      6076.1154855643,
      8,
    );
    expect(convert("Knots", "Miles per Hour", 1)).toBeCloseTo(1.150779448, 8);
    expect(
      convert("Millibars", "Pounds-Force per Square Inch", 1000),
    ).toBeCloseTo(14.503773773, 8);
    expect(convert("US Gallons per Minute", "Litres per Minute", 1)).toBe(
      3.785411784,
    );
    expect(
      convert("Miles per US Gallon", "Miles per Imperial Gallon", 30),
    ).toBeCloseTo(36.028497765, 8);
    expect(convert("Parts per Million", "Percentage", 1)).toBe(0.0001);
    expect(convert("Parts per Billion", "Parts per Million", 1)).toBe(0.001);
    expect(convert("Milligrams per Decilitre", "Grams per Litre", 100)).toBe(1);
  });

  it("keeps reference-dependent and dimensionally different quantities separate", () => {
    for (const [source, target] of [
      ["Rads", "Rems"],
      ["Curies", "Hertz"],
      ["Rads", "Curies"],
      ["Revolutions per Minute", "Hertz"],
      ["Poises", "Stokes"],
      ["Kilometers per Litre", "Litres per 100 Kilometers"],
      ["Milligrams per Decilitre", "Moles per Litre"],
      ["Parts per Million", "Milligrams per Litre"],
      ["Decibel Milliwatts", "Watts"],
      ["Decibels", "Decibel Milliwatts"],
      [
        "Decibels (A-Weighted Sound Pressure)",
        "Decibels (C-Weighted Sound Pressure)",
      ],
      ["Decibels (Sound Pressure)", "Decibels (A-Weighted Sound Pressure)"],
      ["Decibels (Sound Pressure)", "Pascals"],
    ] as const) {
      expect(
        conversionPath(source, target),
        `${source} to ${target}`,
      ).toBeUndefined();
    }
  });

  it("converts referenced power levels while retaining negative readings", () => {
    expect(convert("Decibel Milliwatts", "Decibel Watts", 0)).toBe(-30);
    expect(convert("Decibel Watts", "Decibel Milliwatts", 0)).toBe(30);
    expect(convert("Decibel Milliwatts", "Decibel Watts", -90)).toBe(-120);
  });

  describe("temperature differences", () => {
    const units = [
      { title: "Kelvin Difference", system: "Metric", kelvins: 1 },
      { title: "Celsius Difference", system: "Metric", kelvins: 1 },
      { title: "Fahrenheit Difference", system: "Imperial", kelvins: 5 / 9 },
      { title: "Rankine Difference", system: "Imperial", kelvins: 5 / 9 },
    ];

    it.each(
      units.flatMap((source) =>
        units
          .filter((target) => target.title !== source.title)
          .map((target) => ({ source, target })),
      ),
    )(
      "converts $source.title to $target.title without offsets",
      ({ source, target }) => {
        for (const value of [-1000, -18, 0, 0.125, 18]) {
          const result = convert(source.title, target.title, value);
          expect(result).toBeCloseTo(
            (value * source.kelvins) / target.kelvins,
            10,
          );
          expect(convert(target.title, source.title, result)).toBeCloseTo(
            value,
            10,
          );
        }
        expect(convert(source.title, target.title, 0)).toBe(0);
      },
    );

    it("uses separate abstract groups and permits signed fractional differences", () => {
      expect(getSeeded("Temperature Difference").schema).toMatchObject({
        abstract: true,
        type: "number",
        allOf: [{ $ref: blockProtocolDataTypes.number.dataTypeId }],
      });
      for (const system of ["Metric", "Imperial"]) {
        expect(
          getSeeded(`Temperature Difference (${system})`).schema,
        ).toMatchObject({
          abstract: true,
          allOf: [{ $ref: `${baseUrl("Temperature Difference")}v/1` }],
        });
      }
      for (const { title, system } of units) {
        const { schema } = getSeeded(title);
        expect(schema).toMatchObject({
          type: "number",
          allOf: [
            { $ref: `${baseUrl(`Temperature Difference (${system})`)}v/1` },
          ],
        });
        expect(schema.abstract).not.toBe(true);
        for (const bound of [
          "minimum",
          "maximum",
          "exclusiveMinimum",
          "exclusiveMaximum",
          "multipleOf",
        ]) {
          expect(schema).not.toHaveProperty(bound);
        }
      }
    });

    it("does not convert differences to temperature readings", () => {
      const readings = commonUnitGroups.find(
        ({ title }) => title === "Temperature",
      )?.units;
      expect(readings?.length).toBeGreaterThan(0);
      for (const { title: difference } of units) {
        for (const { title: reading } of readings ?? []) {
          expect(conversionPath(difference, reading)).toBeUndefined();
          expect(conversionPath(reading, difference)).toBeUndefined();
        }
      }
      expect(convert("Degrees Celsius", "Kelvins", 0)).toBe(273.15);
      expect(convert("Degrees Fahrenheit", "Kelvins", 32)).toBe(273.15);
      expect(convert("Celsius Difference", "Fahrenheit Difference", 10)).toBe(
        18,
      );
    });
  });

  it("bounds fuel quantities without rejecting zero", () => {
    for (const title of [
      "Litres per 100 Kilometers",
      "Kilometers per Litre",
      "Miles per US Gallon",
      "Miles per Imperial Gallon",
    ]) {
      expect(getSeeded(title).schema).toMatchObject({ minimum: 0 });
    }
    for (const title of [
      "Fuel Economy",
      "Fuel Economy (Metric)",
      "Fuel Economy (Imperial)",
      "Fuel Economy (US Customary)",
    ]) {
      expect(getSeeded(title).schema).not.toHaveProperty("minimum");
    }
  });
});

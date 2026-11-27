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
// The supply chain types it moves are covered in `move-scrap-percentage.test.ts`.
vi.mock("./035-add-common-unit-data-types/move-scrap-percentage", () => ({
  moveScrapPercentage: vi.fn(),
}));

const seeded = new Map<
  string,
  { schema: DataType; conversions: Record<BaseUrl, Conversions> }
>();
const baseUrl = (title: string) =>
  `https://hash.ai/@h/types/data-type/${slugifyTypeTitle(title)}/` as BaseUrl;
const getSeeded = (title: string) => {
  const unit =
    seeded.get(baseUrl(title)) ??
    [...seeded.values()].find(({ schema }) => schema.title === title);
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
  const direct =
    from[getSeeded(target).schema.$id.replace(/v\/[^/]+$/, "") as BaseUrl];
  if (direct) {
    return [direct.to];
  }
  const reverse =
    to[getSeeded(source).schema.$id.replace(/v\/[^/]+$/, "") as BaseUrl];
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
    async (
      _context,
      _authentication,
      { dataTypeDefinition, dataTypeBaseUrl, conversions },
    ) => {
      const url = dataTypeBaseUrl ?? baseUrl(dataTypeDefinition.title);
      const schema: DataType = {
        ...dataTypeDefinition,
        $id: `${url}v/1`,
        $schema:
          "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
        kind: "dataType",
      };
      expect(seeded.has(url), schema.title).toBe(false);
      seeded.set(url, { schema, conversions });
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
    const registry = new Map<BaseUrl, string>(
      Object.values(systemDataTypes).map((entry) => [
        entry.dataTypeBaseUrl,
        entry.title,
      ]),
    );
    const seededBaseUrls = new Set(seeded.keys());
    for (const { schema, conversions } of seeded.values()) {
      expect(
        registry.get(schema.$id.replace(/v\/[^/]+$/, "") as BaseUrl),
        schema.title,
      ).toBe(schema.title);
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
          current?.units.find(
            ({ dataTypeBaseUrl, title }) =>
              (dataTypeBaseUrl ?? title) ===
              (unit.dataTypeBaseUrl ?? unit.title),
          ),
        ).toEqual(unit);
      }
    }
  });

  it("provides plural titles while leaving historical seeded names unchanged", () => {
    for (const { schema } of seeded.values()) {
      const historic = [systemDataTypes.knots, systemDataTypes.percentage].find(
        ({ dataTypeBaseUrl }) => schema.$id.startsWith(dataTypeBaseUrl),
      );
      if (historic) {
        expect(schema.title).toBe(historic.title);
        expect(schema).not.toHaveProperty("titlePlural");
      } else {
        expect(schema.titlePlural, schema.title).toBeTruthy();
        expect(
          Object.values(systemDataTypes).find(({ dataTypeBaseUrl }) =>
            schema.$id.startsWith(dataTypeBaseUrl),
          ),
        ).toMatchObject({
          title: schema.title,
          titlePlural: schema.titlePlural,
        });
      }
    }
    expect(systemDataTypes.knots.title).toBe("Knots");
    expect(systemDataTypes.percentage.title).toBe("Percentage");
    expect(systemDataTypes.knots).not.toHaveProperty("titlePlural");
    expect(systemDataTypes.percentage).not.toHaveProperty("titlePlural");
  });

  it.each([
    ["Curie", "Curie", "Curies"],
    ["Celsius Difference", "Celsius Difference", "Celsius Differences"],
    ["Standard Gravity", "Standard Gravity", "Standard Gravities"],
    [
      "Inch of Water (Conventional)",
      "Inch of Water (Conventional)",
      "Inches of Water (Conventional)",
    ],
    ["Stokes", "Stokes", "Stokes"],
    ["Centistokes", "Centistokes", "Centistokes"],
    ["Part per Million", "Part per Million", "Parts per Million"],
    [
      "Liter per 100 Kilometers",
      "Liter per 100 Kilometers",
      "Liters per 100 Kilometers",
    ],
    [
      "Energy (US Customary)",
      "Energy (US Customary)",
      "Energies (US Customary)",
    ],
  ])(
    "derives the %s identifier from its singular title",
    (identifierTitle, title, titlePlural) => {
      expect(getSeeded(identifierTitle).schema).toMatchObject({
        $id: `${baseUrl(identifierTitle)}v/1`,
        title,
        titlePlural,
      });
    },
  );

  it.each([
    ["Curie", "Becquerel", 37e9],
    ["Rad", "Gray", 0.01],
    ["Rem", "Sievert", 0.01],
    ["Nautical Mile", "Meters", 1852],
    ["Hectare", "Square Metres", 10000],
    ["Metric Carat", "Kilograms", 0.0002],
    ["Knots", "Meters per Second", 1852 / 3600],
    ["Millibar", "Pascal", 100],
    ["Torr", "Pascal", 101325 / 760],
    ["Millimeter of Mercury (Conventional)", "Pascal", 133.322387415],
    ["Inch of Water (Conventional)", "Pascal", 249.08891],
    ["Electronvolt", "Joule", 1.602176634e-19],
    ["Calorie (Thermochemical)", "Joule", 4.184],
    ["Kilocalorie (Thermochemical)", "Joule", 4184],
    ["Calorie (IT)", "Joule", 4.1868],
    ["Kilocalorie (IT)", "Joule", 4186.8],
    ["Therm (US)", "Joule", 105480400],
    ["Therm (EC)", "Joule", 105506000],
    ["Metric Horsepower", "Watts", 735.49875],
    ["Arcminute", "Degree", 1 / 60],
    ["Arcsecond", "Degree", 1 / 3600],
    ["Revolution", "Degree", 360],
    ["Revolution per Second", "Radian per Second", 2 * Math.PI],
    ["Revolution per Minute", "Radian per Second", Math.PI / 30],
    ["Standard Gravity", "Meter per Second Squared", 9.80665],
    ["Kilogram-Force", "Newton", 9.80665],
    ["Poise", "Pascal Second", 0.1],
    ["Centipoise", "Pascal Second", 0.001],
    ["Milligram per Deciliter", "Kilogram per Cubic Meter", 0.01],
    ["Milligram per Liter", "Kilogram per Cubic Meter", 0.001],
    ["Gram per Liter", "Kilogram per Cubic Meter", 1],
    ["Foot-Lambert", "Candela per Square Meter", 1 / (Math.PI * 0.09290304)],
    ["Square Millimeter per Second", "Square Meter per Second", 1e-6],
    ["Stokes", "Square Meter per Second", 1e-4],
    ["Centistokes", "Square Meter per Second", 1e-6],
    ["Percentage", "One", 0.01],
    ["Part per Million", "One", 1e-6],
    ["Part per Billion", "One", 1e-9],
    ["Cubic Meter per Hour", "Cubic Meter per Second", 1 / 3600],
    ["Liter per Second", "Cubic Meter per Second", 0.001],
    ["Liter per Minute", "Cubic Meter per Second", 1 / 60000],
    ["US Gallon per Minute", "Cubic Meter per Second", 0.003785411784 / 60],
    ["Imperial Gallon per Minute", "Cubic Meter per Second", 0.00454609 / 60],
    ["Cubic Foot per Minute", "Cubic Meter per Second", 0.028316846592 / 60],
    ["Decibel", "Bel", 0.1],
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
    ["Mile per US Gallon", 1.609344 / 3.785411784],
    ["Mile per Imperial Gallon", 1.609344 / 4.54609],
  ] as const)("converts fuel economy in %s", (title, factor) => {
    for (const value of [0, 0.1, 1, 25, 1000]) {
      expect(convert(title, "Kilometer per Liter", value)).toBeCloseTo(
        value * factor,
        10,
      );
      expect(convert("Kilometer per Liter", title, value * factor)).toBeCloseTo(
        value,
        10,
      );
      expect(conversionPath(title, "Liter per 100 Kilometers")).toBeUndefined();
    }
  });

  it("converts across systems using shared references", () => {
    expect(convert("Nautical Mile", "Feet", 1)).toBeCloseTo(6076.1154855643, 8);
    expect(convert("Knots", "Mile per Hour", 1)).toBeCloseTo(1.150779448, 8);
    expect(
      convert("Millibar", "Pound-Force per Square Inch", 1000),
    ).toBeCloseTo(14.503773773, 8);
    expect(convert("US Gallon per Minute", "Liter per Minute", 1)).toBe(
      3.785411784,
    );
    expect(
      convert("Mile per US Gallon", "Mile per Imperial Gallon", 30),
    ).toBeCloseTo(36.028497765, 8);
    expect(convert("Part per Million", "Percentage", 1)).toBe(0.0001);
    expect(convert("Part per Billion", "Part per Million", 1)).toBe(0.001);
    expect(convert("Milligram per Deciliter", "Gram per Liter", 100)).toBe(1);
  });

  it("keeps reference-dependent and dimensionally different quantities separate", () => {
    for (const [source, target] of [
      ["Rad", "Rem"],
      ["Curie", "Hertz"],
      ["Rad", "Curie"],
      ["Revolution per Minute", "Hertz"],
      ["Poise", "Stokes"],
      ["Kilometer per Liter", "Liter per 100 Kilometers"],
      ["Milligram per Deciliter", "Mole per Liter"],
      ["Part per Million", "Milligram per Liter"],
      ["Decibel Milliwatt", "Watts"],
      ["Decibel", "Decibel Milliwatt"],
      [
        "Decibel (A-Weighted Sound Pressure)",
        "Decibel (C-Weighted Sound Pressure)",
      ],
      ["Decibel (Sound Pressure)", "Decibel (A-Weighted Sound Pressure)"],
      ["Decibel (Sound Pressure)", "Pascal"],
    ] as const) {
      expect(
        conversionPath(source, target),
        `${source} to ${target}`,
      ).toBeUndefined();
    }
  });

  it("converts referenced power levels while retaining negative readings", () => {
    expect(convert("Decibel Milliwatt", "Decibel Watt", 0)).toBe(-30);
    expect(convert("Decibel Watt", "Decibel Milliwatt", 0)).toBe(30);
    expect(convert("Decibel Milliwatt", "Decibel Watt", -90)).toBe(-120);
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
      expect(convert("Degree Celsius", "Kelvin", 0)).toBe(273.15);
      expect(convert("Degree Fahrenheit", "Kelvin", 32)).toBe(273.15);
      expect(convert("Celsius Difference", "Fahrenheit Difference", 10)).toBe(
        18,
      );
    });
  });

  it("bounds fuel quantities without rejecting zero", () => {
    for (const title of [
      "Liter per 100 Kilometers",
      "Kilometer per Liter",
      "Mile per US Gallon",
      "Mile per Imperial Gallon",
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

import { describe, expect, it, vi } from "vitest";

import {
  makeOntologyTypeVersion,
  versionedUrlFromComponents,
} from "@blockprotocol/type-system";
import { createConversionFunction } from "@local/hash-isomorphic-utils/data-types";
import {
  systemDataTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { slugifyTypeTitle } from "@local/hash-isomorphic-utils/slugify-type-title";

import { createSystemPropertyTypeIfNotExists } from "../util";
import migrate from "./036-add-iso-quantity-types.migration";
import { isoDataTypes } from "./036-add-iso-quantity-types/data-types";
import { isoPropertyTypes } from "./036-add-iso-quantity-types/property-types";
import { ensureUnitDataType } from "./shared/ensure-unit-data-type";

import type { MigrationFunction, MigrationState } from "../types";
import type { BaseUrl, DataTypeWithMetadata } from "@blockprotocol/type-system";

vi.mock("./shared/ensure-unit-data-type", () => ({
  ensureUnitDataType: vi.fn(),
}));
vi.mock("../util", () => ({
  createSystemPropertyTypeIfNotExists: vi.fn(),
}));

const dataType = (title: string) => {
  const item = isoDataTypes.find(
    ({ dataTypeBaseUrl }) =>
      dataTypeBaseUrl ===
      `https://hash.ai/@h/types/data-type/${slugifyTypeTitle(title)}/`,
  );
  if (!item) {
    throw new Error(`Missing data type: ${title}`);
  }
  return item;
};
const propertyType = (title: string) => {
  const item = isoPropertyTypes.find(
    ({ definition }) => definition.title === title,
  );
  if (!item) {
    throw new Error(`Missing property type: ${title}`);
  }
  return item.definition;
};

const version = makeOntologyTypeVersion({ major: 3 });

describe("ISO quantity catalogue", () => {
  it("seeds dependencies first and resolves the versions in this installation", async () => {
    const newBaseUrls = new Set(
      isoDataTypes.map(({ dataTypeBaseUrl }) => dataTypeBaseUrl),
    );
    const migrationState: MigrationState = {
      dataTypeVersions: Object.fromEntries(
        Object.values(systemDataTypes)
          .filter(({ dataTypeBaseUrl }) => !newBaseUrls.has(dataTypeBaseUrl))
          .map(({ dataTypeBaseUrl }) => [dataTypeBaseUrl, version]),
      ),
      propertyTypeVersions: {},
      entityTypeVersions: {},
    };
    const seededProperties = new Set<string>();
    vi.mocked(ensureUnitDataType).mockImplementation(
      async (
        _context,
        _authentication,
        { dataTypeDefinition, dataTypeBaseUrl, conversions },
      ) => {
        for (const reference of dataTypeDefinition.allOf ?? []) {
          if (reference.$ref.startsWith("https://hash.ai/@h/")) {
            expect(reference.$ref).toMatch(/\/v\/3$/);
          }
        }
        for (const target of Object.keys(conversions) as BaseUrl[]) {
          expect(migrationState.dataTypeVersions[target], target).toBeDefined();
        }
        if (!dataTypeBaseUrl) {
          throw new Error(
            `Missing explicit identifier: ${dataTypeDefinition.title}`,
          );
        }
        const baseUrl = dataTypeBaseUrl;
        migrationState.dataTypeVersions[baseUrl] = version;
        return {
          schema: {
            ...dataTypeDefinition,
            $id: versionedUrlFromComponents(baseUrl, version),
          },
        } as DataTypeWithMetadata;
      },
    );
    vi.mocked(createSystemPropertyTypeIfNotExists).mockImplementation(
      async (_context, _authentication, { propertyTypeDefinition }) => {
        for (const possible of propertyTypeDefinition.possibleValues) {
          if (possible.dataTypeId) {
            expect(possible.dataTypeId).toMatch(/\/v\/3$/);
          }
          for (const reference of Object.values(
            possible.propertyTypeObjectProperties ?? {},
          )) {
            expect("$ref" in reference).toBe(true);
            if ("$ref" in reference) {
              expect(seededProperties.has(reference.$ref), reference.$ref).toBe(
                true,
              );
            }
          }
        }
        seededProperties.add(
          `https://hash.ai/@h/types/property-type/${slugifyTypeTitle(propertyTypeDefinition.title)}/v/1`,
        );
        return {} as Awaited<
          ReturnType<typeof createSystemPropertyTypeIfNotExists>
        >;
      },
    );
    await migrate({
      context: {} as Parameters<MigrationFunction>[0]["context"],
      authentication: {} as Parameters<MigrationFunction>[0]["authentication"],
      migrationState,
    });
    expect(ensureUnitDataType).toHaveBeenCalledTimes(isoDataTypes.length);
    expect(createSystemPropertyTypeIfNotExists).toHaveBeenCalledTimes(
      isoPropertyTypes.length,
    );
  });

  it("registers unique native URLs and keeps every ISO locator in one property", () => {
    const locators = isoPropertyTypes.flatMap(({ isoItems }) => isoItems);
    expect(new Set(locators).size).toBe(locators.length);
    expect(locators).toHaveLength(721);
    expect(
      new Set(isoDataTypes.map(({ dataTypeBaseUrl }) => dataTypeBaseUrl)).size,
    ).toBe(isoDataTypes.length);
    expect(
      new Set(isoDataTypes.map(({ definition }) => definition.title)).size,
    ).toBe(isoDataTypes.length);
    for (const { dataTypeBaseUrl, definition } of isoDataTypes) {
      expect(definition.titlePlural, definition.title).toBeTruthy();
      expect(
        Object.values(systemDataTypes).find(
          (entry) => entry.dataTypeBaseUrl === dataTypeBaseUrl,
        ),
      ).toMatchObject({
        dataTypeId: `${dataTypeBaseUrl}v/1`,
        title: definition.title,
        titlePlural: definition.titlePlural,
      });
    }
    const propertyTitles = isoPropertyTypes.map(
      ({ definition }) => definition.title,
    );
    expect(new Set(propertyTitles).size).toBe(propertyTitles.length);
    const registeredPropertyIds = new Set<string>(
      Object.values(systemPropertyTypes).map(
        ({ propertyTypeId }) => propertyTypeId,
      ),
    );
    for (const title of propertyTitles) {
      expect(
        registeredPropertyIds.has(
          `https://hash.ai/@h/types/property-type/${slugifyTypeTitle(title)}/v/1`,
        ),
        title,
      ).toBe(true);
    }
  });

  it.each([
    ["Negative Number", "Negative Number", "Negative Numbers"],
    ["Non-negative Number", "Non-negative Number", "Non-negative Numbers"],
    [
      "Fractional Part per Million",
      "Fractional Part per Million",
      "Fractional Parts per Million",
    ],
    ["Moment of Inertia", "Moment of Inertia", "Moments of Inertia"],
    [
      "Angular Momentum (Metric)",
      "Angular Momentum (Metric)",
      "Angular Momenta (Metric)",
    ],
    ["Kibibyte", "Kibibyte", "Kibibytes"],
    ["Megabyte per Second", "Megabyte per Second", "Megabytes per Second"],
    ["Reciprocal Henry", "Reciprocal Henry", "Reciprocal Henries"],
    ["Siemens per Meter", "Siemens per Meter", "Siemens per Meter"],
    [
      "Decibel (Sound Power)",
      "Decibel (Sound Power)",
      "Decibels (Sound Power)",
    ],
  ])(
    "derives the %s identifier from its singular title",
    (identifierTitle, title, titlePlural) => {
      expect(dataType(identifierTitle)).toMatchObject({
        dataTypeBaseUrl: `https://hash.ai/@h/types/data-type/${slugifyTypeTitle(identifierTitle)}/`,
        definition: { title, titlePlural },
      });
    },
  );

  it("leaves historical storage unit names and metadata unchanged", () => {
    for (const [key, title] of [
      ["bits", "Bits"],
      ["bytes", "Bytes"],
      ["kilobytes", "Kilobytes"],
      ["megabytes", "Megabytes"],
      ["gigabytes", "Gigabytes"],
      ["terabytes", "Terabytes"],
    ] as const) {
      const historical = systemDataTypes[key];
      expect(historical.title).toBe(title);
      expect(historical).not.toHaveProperty("titlePlural");
      expect(
        isoDataTypes.some(
          ({ dataTypeBaseUrl }) =>
            dataTypeBaseUrl === historical.dataTypeBaseUrl,
        ),
      ).toBe(false);
    }
  });

  it.each([
    ["Barn", "squareMetres", 1e28, 1],
    ["Angstrom", "meters", 1e10, 1],
    ["Astronomical Unit", "meters", 1, 149597870700],
    ["Dalton", "kilograms", 1, 1.66053906892e-27],
    ["Kibibyte", "bytes", 1, 1024],
    ["Kibibit", "bytes", 8, 1024],
    ["Quebibyte", "bytes", 1, 2 ** 100],
    ["Robibit", "bytes", 8, 2 ** 90],
    ["Quettabit", "bytes", 8, 1e30],
    ["Kibibyte per Second", "bitPerSecond", 1, 8192],
    ["Megabit per Second", "bitPerSecond", 1, 1e6],
    ["Megabyte per Second", "bitPerSecond", 1, 8e6],
    ["Gram per Mole", "kilogramPerMole", 18, 0.018],
    ["Millisiemens per Centimeter", "siemensPerMeter", 10, 1],
    ["Joule per Nanometer", "joulePerMeterOfWavelength", 2, 2e9],
    ["Sievert per Hour", "sievertPerSecond", 3600, 1],
    ["Fractional Percentage", "unitInterval", 25, 0.25],
    ["Fractional Part per Million", "unitInterval", 250000, 0.25],
    ["Semitone", "octave", 12, 1],
    ["Cent (Frequency Interval)", "octave", 1200, 1],
    ["Decade (Frequency Interval)", "octave", 1, Math.log2(10)],
    ["Hartley", "shannon", 1, Math.log2(10)],
    ["Nat", "shannon", 1, Math.LOG2E],
    ["Decibel (Sound Power)", "decibelWatt", 120, 0],
  ] as const)(
    "converts %s to %s in both directions",
    (source, target, input, output) => {
      const conversion =
        dataType(source).conversions[systemDataTypes[target].dataTypeBaseUrl];
      expect(conversion).toBeDefined();
      if (!conversion) {
        throw new Error(`Missing conversion for ${source}`);
      }
      const to = createConversionFunction([conversion.to]);
      const from = createConversionFunction([conversion.from]);
      expect(to(input)).toBeCloseTo(output, 10);
      expect(from(output)).toBeCloseTo(input, 10);
    },
  );

  it("keeps conversion constants exact for the largest binary prefixes", () => {
    const conversion =
      dataType("Quebibyte").conversions[systemDataTypes.bytes.dataTypeBaseUrl];
    const constants: number[] = [];
    const visit = (value: unknown) => {
      if (Array.isArray(value)) {
        for (const item of value) {
          visit(item);
        }
      } else if (value && typeof value === "object" && "const" in value) {
        expect(typeof value.const).toBe("number");
        if (typeof value.const === "number") {
          constants.push(value.const);
        }
      }
    };
    visit(conversion?.to.expression);
    expect(constants.length).toBeGreaterThan(1);
    expect(constants.every(Number.isSafeInteger)).toBe(true);
    expect(
      constants.reduce((product, value) => product * BigInt(value), 1n),
    ).toBe(2n ** 100n);
  });

  it("puts probability and count bounds on reusable data types", () => {
    expect(dataType("Unit Interval").definition).toMatchObject({
      minimum: 0,
      maximum: 1,
    });
    expect(dataType("Fractional Percentage").definition).toMatchObject({
      minimum: 0,
      maximum: 100,
    });
    expect(dataType("Non-negative Integer").definition).toMatchObject({
      minimum: 0,
      allOf: [{ $ref: systemDataTypes.integer.dataTypeId }],
    });
    expect(propertyType("Error Probability").possibleValues).toEqual([
      { dataTypeId: systemDataTypes.boundedFraction.dataTypeId },
    ]);
    expect(propertyType("Hamming Distance").possibleValues).toEqual([
      { dataTypeId: systemDataTypes["non-negativeInteger"].dataTypeId },
    ]);
    expect(propertyType("Mean Queue Length").possibleValues).toEqual([
      { dataTypeId: systemDataTypes["non-negativeNumber"].dataTypeId },
    ]);
    expect(propertyType("Relative Humidity").possibleValues).toEqual([
      { dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId },
    ]);
  });

  it("represents vectors, tensors and complex quantities through property composition", () => {
    for (const [title, count] of [
      ["Velocity", 4],
      ["Stress", 10],
      ["Impedance", 2],
      ["Electric Current Phasor", 3],
    ] as const) {
      const shape = propertyType(title).possibleValues[0];
      expect(shape?.propertyTypeObjectRequiredProperties).toHaveLength(count);
      expect(
        Object.keys(shape?.propertyTypeObjectProperties ?? {}),
      ).toHaveLength(count);
    }
    expect(propertyType("Velocity").possibleValues[0]).toMatchObject({
      propertyTypeObjectProperties: {
        [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
          $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
        },
      },
    });
  });

  it("does not invent relationships between different kinds of quantity", () => {
    for (const title of ["Baud", "Erlang", "Shannon", "Bit per Second"]) {
      expect(dataType(title).conversions).toEqual({});
    }
    expect(propertyType("Thermodynamic Entropy").possibleValues).not.toEqual(
      propertyType("Information Entropy").possibleValues,
    );
    expect(dataType("Volt Ampere").conversions).toEqual({});
    expect(dataType("Var").conversions).toEqual({});
    expect(propertyType("Sound Pressure Level").possibleValues).toEqual([
      { dataTypeId: systemDataTypes["decibel(soundPressure)"].dataTypeId },
    ]);
  });
});

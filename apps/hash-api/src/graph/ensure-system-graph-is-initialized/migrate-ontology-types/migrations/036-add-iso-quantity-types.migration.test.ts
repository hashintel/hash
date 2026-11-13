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
    ({ definition }) => definition.title === title,
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
      isoDataTypes.map(
        ({ definition }) =>
          `https://hash.ai/@h/types/data-type/${slugifyTypeTitle(definition.title)}/`,
      ),
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
        { dataTypeDefinition, conversions },
      ) => {
        for (const reference of dataTypeDefinition.allOf ?? []) {
          if (reference.$ref.startsWith("https://hash.ai/@h/")) {
            expect(reference.$ref).toMatch(/\/v\/3$/);
          }
        }
        for (const target of Object.keys(conversions) as BaseUrl[]) {
          expect(migrationState.dataTypeVersions[target], target).toBeDefined();
        }
        const baseUrl =
          `https://hash.ai/@h/types/data-type/${slugifyTypeTitle(dataTypeDefinition.title)}/` as BaseUrl;
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
    for (const [items, registry, kind] of [
      [isoDataTypes, systemDataTypes, "data"],
      [isoPropertyTypes, systemPropertyTypes, "property"],
    ] as const) {
      const titles = items.map(({ definition }) => definition.title);
      expect(new Set(titles).size).toBe(titles.length);
      const registered = new Set(
        Object.values(registry).map((entry) =>
          "dataTypeId" in entry ? entry.dataTypeId : entry.propertyTypeId,
        ),
      );
      for (const title of titles) {
        expect(
          registered.has(
            `https://hash.ai/@h/types/${kind}-type/${slugifyTypeTitle(title)}/v/1`,
          ),
          title,
        ).toBe(true);
      }
    }
  });

  it.each([
    ["Barns", "squareMetres", 1e28, 1],
    ["Angstroms", "meters", 1e10, 1],
    ["Astronomical Units", "meters", 1, 149597870700],
    ["Daltons", "kilograms", 1, 1.66053906892e-27],
    ["Kibibytes", "bytes", 1, 1024],
    ["Kibibits", "bytes", 8, 1024],
    ["Quebibytes", "bytes", 1, 2 ** 100],
    ["Robibits", "bytes", 8, 2 ** 90],
    ["Quettabits", "bytes", 8, 1e30],
    ["Kibibytes per Second", "bitsPerSecond", 1, 8192],
    ["Megabits per Second", "bitsPerSecond", 1, 1e6],
    ["Megabytes per Second", "bitsPerSecond", 1, 8e6],
    ["Grams per Mole", "kilogramsPerMole", 18, 0.018],
    ["Millisiemens per Centimeter", "siemensPerMeter", 10, 1],
    ["Joules per Nanometer", "joulesPerMeter", 2, 2e9],
    ["Sieverts per Hour", "sievertsPerSecond", 3600, 1],
    ["Fractional Percentage", "unitInterval", 25, 0.25],
    ["Fractional Parts per Million", "unitInterval", 250000, 0.25],
    ["Semitones", "octaves", 12, 1],
    ["Cents (Frequency Interval)", "octaves", 1200, 1],
    ["Decades (Frequency Interval)", "octaves", 1, Math.log2(10)],
    ["Hartleys", "shannons", 1, Math.log2(10)],
    ["Nats", "shannons", 1, Math.LOG2E],
    ["Decibels (Sound Power)", "decibelWatts", 120, 0],
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
      dataType("Quebibytes").conversions[systemDataTypes.bytes.dataTypeBaseUrl];
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
      { dataTypeId: systemDataTypes.nonNegativeInteger.dataTypeId },
    ]);
    expect(propertyType("Mean Queue Length").possibleValues).toEqual([
      { dataTypeId: systemDataTypes.nonNegativeNumber.dataTypeId },
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
    for (const title of ["Bauds", "Erlangs", "Shannons", "Bits per Second"]) {
      expect(dataType(title).conversions).toEqual({});
    }
    expect(propertyType("Thermodynamic Entropy").possibleValues).not.toEqual(
      propertyType("Information Entropy").possibleValues,
    );
    expect(dataType("Volt Amperes").conversions).toEqual({});
    expect(dataType("Vars").conversions).toEqual({});
    expect(propertyType("Sound Pressure Level").possibleValues).toEqual([
      { dataTypeId: systemDataTypes.decibelsSoundPressure.dataTypeId },
    ]);
  });
});

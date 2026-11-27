import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  componentsFromVersionedUrl,
  makeOntologyTypeVersion,
  versionedUrlFromComponents,
} from "@blockprotocol/type-system";
import {
  systemDataTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { slugifyTypeTitle } from "@local/hash-isomorphic-utils/slugify-type-title";

import { createSystemPropertyTypeIfNotExists } from "../util";
import migrate from "./037-add-practical-property-types.migration";
import { measurementDataTypes } from "./037-add-practical-property-types/data-types";
import { measurementPropertyTypes } from "./037-add-practical-property-types/property-types";
import { ensureUnitDataType } from "./shared/ensure-unit-data-type";

import type { MigrationFunction, MigrationState } from "../types";
import type { BaseUrl, DataTypeWithMetadata } from "@blockprotocol/type-system";

vi.mock("../util", () => ({
  createSystemPropertyTypeIfNotExists: vi.fn(),
}));
vi.mock("./shared/ensure-unit-data-type", () => ({
  ensureUnitDataType: vi.fn(),
}));

const parameters = (migrationState: MigrationState) => ({
  context: {} as Parameters<MigrationFunction>[0]["context"],
  authentication: {} as Parameters<MigrationFunction>[0]["authentication"],
  migrationState,
});

const state = (): MigrationState => ({
  dataTypeVersions: Object.fromEntries(
    Object.values(systemDataTypes).map(({ dataTypeBaseUrl }, index) => [
      dataTypeBaseUrl,
      makeOntologyTypeVersion({ major: index % 2 === 0 ? 3 : 5 }),
    ]),
  ),
  propertyTypeVersions: {},
  entityTypeVersions: {},
});

const acceptedDataType = (title: string) => {
  const property = measurementPropertyTypes.find(
    (item) => item.title === title,
  );
  if (!property) {
    throw new Error(`Missing property: ${title}`);
  }
  return property.possibleValues[0].dataTypeId;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ensureUnitDataType).mockImplementation(
    async (
      _context,
      _authentication,
      { dataTypeDefinition, dataTypeBaseUrl, migrationState },
    ) => {
      if (!dataTypeBaseUrl) {
        throw new Error(
          `Missing data-type identifier: ${dataTypeDefinition.title}`,
        );
      }
      const version =
        migrationState.dataTypeVersions[dataTypeBaseUrl] ??
        makeOntologyTypeVersion({ major: 1 });
      Object.assign(migrationState.dataTypeVersions, {
        [dataTypeBaseUrl]: version,
      });
      return {
        schema: {
          ...dataTypeDefinition,
          $id: versionedUrlFromComponents(dataTypeBaseUrl, version),
        },
      } as DataTypeWithMetadata;
    },
  );
});

describe("practical measurement properties", () => {
  it("uses each installed data-type version and the idempotent property seeder", async () => {
    const migrationState = state();
    expect(await migrate(parameters(migrationState))).toBe(migrationState);
    expect(createSystemPropertyTypeIfNotExists).toHaveBeenCalledTimes(137);
    for (const [, , request] of vi.mocked(createSystemPropertyTypeIfNotExists)
      .mock.calls) {
      const reference =
        request.propertyTypeDefinition.possibleValues[0]?.dataTypeId;
      if (!reference) {
        throw new Error("The property has no data-type reference");
      }
      const { baseUrl, version } = componentsFromVersionedUrl(reference);
      expect(version).toBe(migrationState.dataTypeVersions[baseUrl]);
      expect(request.webShortname).toBe("h");
      expect(request.migrationState).toBe(migrationState);
    }
  });

  it("fails before writing properties if the first required data type is absent", async () => {
    await expect(
      migrate(
        parameters({
          dataTypeVersions: {},
          propertyTypeVersions: {},
          entityTypeVersions: {},
        }),
      ),
    ).rejects.toThrow("has not been seeded");
    expect(ensureUnitDataType).not.toHaveBeenCalled();
    expect(createSystemPropertyTypeIfNotExists).not.toHaveBeenCalled();
  });

  it("seeds new unit parents and conversion targets before their dependants", async () => {
    const migrationState = state();
    const initialVersions = { ...migrationState.dataTypeVersions };
    for (const { dataTypeBaseUrl } of measurementDataTypes) {
      delete migrationState.dataTypeVersions[dataTypeBaseUrl];
    }
    const seeded: string[] = [];
    vi.mocked(ensureUnitDataType).mockImplementation(
      async (
        _context,
        _authentication,
        { dataTypeDefinition, dataTypeBaseUrl, conversions },
      ) => {
        if (!dataTypeBaseUrl) {
          throw new Error("Missing data-type identifier");
        }
        for (const { $ref } of dataTypeDefinition.allOf ?? []) {
          const { baseUrl, version } = componentsFromVersionedUrl($ref);
          if (baseUrl.startsWith("https://hash.ai/")) {
            expect(version).toBe(migrationState.dataTypeVersions[baseUrl]);
          }
        }
        for (const target of Object.keys(conversions) as BaseUrl[]) {
          expect(migrationState.dataTypeVersions[target], target).toBeDefined();
        }
        const version = makeOntologyTypeVersion({ major: 7 });
        migrationState.dataTypeVersions[dataTypeBaseUrl] = version;
        seeded.push(dataTypeBaseUrl);
        return {
          schema: {
            ...dataTypeDefinition,
            $id: versionedUrlFromComponents(dataTypeBaseUrl, version),
          },
        } as DataTypeWithMetadata;
      },
    );
    await migrate(parameters(migrationState));
    expect(seeded).toEqual(
      measurementDataTypes.map(({ dataTypeBaseUrl }) => dataTypeBaseUrl),
    );
    for (const [baseUrl, version] of Object.entries(initialVersions)) {
      if (!seeded.includes(baseUrl)) {
        expect(migrationState.dataTypeVersions[baseUrl as BaseUrl]).toBe(
          version,
        );
      }
    }
    const rate = vi
      .mocked(createSystemPropertyTypeIfNotExists)
      .mock.calls.find(
        ([, , request]) =>
          request.propertyTypeDefinition.title ===
          "Atmospheric Pressure Change Rate",
      );
    expect(rate?.[2].propertyTypeDefinition.possibleValues[0]?.dataTypeId).toBe(
      versionedUrlFromComponents(
        systemDataTypes.pressureChangeRate.dataTypeBaseUrl,
        makeOntologyTypeVersion({ major: 7 }),
      ),
    );
  });

  it("rejects missing conversion targets and missing property families", async () => {
    const missingTarget = state();
    delete missingTarget.dataTypeVersions[
      systemDataTypes.kilogramPerCubicMeter.dataTypeBaseUrl
    ];
    await expect(migrate(parameters(missingTarget))).rejects.toThrow(
      "Conversion target",
    );
    expect(ensureUnitDataType).not.toHaveBeenCalled();
    const missingPropertyFamily = state();
    delete missingPropertyFamily.dataTypeVersions[
      systemDataTypes.length.dataTypeBaseUrl
    ];
    await expect(migrate(parameters(missingPropertyFamily))).rejects.toThrow(
      "has not been seeded",
    );
    expect(createSystemPropertyTypeIfNotExists).not.toHaveBeenCalled();
  });

  it("registers a unique native URL for each property", () => {
    const ids = new Set<string>();
    const registered = Object.values(systemPropertyTypes).map(
      ({ propertyTypeId }) => propertyTypeId,
    );
    for (const { title } of measurementPropertyTypes) {
      const id = `https://hash.ai/@h/types/property-type/${slugifyTypeTitle(title)}/v/1`;
      expect(ids.has(id), title).toBe(false);
      expect(
        registered.filter((registeredId) => registeredId === id),
        title,
      ).toHaveLength(1);
      ids.add(id);
    }
  });

  it.each([
    ["Battery Charge Capacity", systemDataTypes.electricCharge.dataTypeId],
    ["Battery Energy Capacity", systemDataTypes.energy.dataTypeId],
    ["Fuel Consumption", systemDataTypes.fuelConsumption.dataTypeId],
    ["Fuel Economy", systemDataTypes.fuelEconomy.dataTypeId],
    [
      "Dissolved Oxygen Mass Concentration",
      systemDataTypes.massDensity.dataTypeId,
    ],
    [
      "Dissolved Oxygen Amount Concentration",
      systemDataTypes.amountConcentration.dataTypeId,
    ],
    ["Rated Apparent Power", systemDataTypes.apparentPower.dataTypeId],
    ["Rated Reactive Power", systemDataTypes.reactivePower.dataTypeId],
    ["Rated Input Power", systemDataTypes.power.dataTypeId],
    ["Available Storage Capacity", systemDataTypes.information.dataTypeId],
    ["Network Download Rate", systemDataTypes.dataTransferRate.dataTypeId],
    ["Tank Capacity", systemDataTypes.volume.dataTypeId],
    ["Payload Mass", systemDataTypes.mass.dataTypeId],
    ["PM1 Mass Concentration", systemDataTypes.massDensity.dataTypeId],
    ["PM2.5 Mass Concentration", systemDataTypes.massDensity.dataTypeId],
    ["PM10 Mass Concentration", systemDataTypes.massDensity.dataTypeId],
    [
      "Total Suspended Particulate Mass Concentration",
      systemDataTypes.massDensity.dataTypeId,
    ],
    [
      "Aerosol Particle Number Concentration",
      systemDataTypes.numberPerVolume.dataTypeId,
    ],
    [
      "Radon Activity Concentration",
      systemDataTypes.activityPerVolume.dataTypeId,
    ],
    ["Borehole Absolute Pressure", systemDataTypes.pressure.dataTypeId],
    ["Borehole Gauge Pressure", systemDataTypes.pressure.dataTypeId],
    ["Differential Pressure", systemDataTypes.pressure.dataTypeId],
    ["Wind Direction", systemDataTypes.angle.dataTypeId],
    ["Depth to Groundwater", systemDataTypes.length.dataTypeId],
    [
      "Battery Terminal Voltage",
      systemDataTypes.electricPotentialDifference.dataTypeId,
    ],
    [
      "Measured Supply Voltage",
      systemDataTypes.electricPotentialDifference.dataTypeId,
    ],
    ["Instrument Internal Temperature", systemDataTypes.temperature.dataTypeId],
    ["Pump Current", systemDataTypes.electricCurrent.dataTypeId],
    [
      "Combustible Gas Level Relative to LEL",
      systemDataTypes.percentageOfLowerExplosiveLimit.dataTypeId,
    ],
    [
      "Methane Surface Mass Flux Density",
      systemDataTypes.massFluxDensity.dataTypeId,
    ],
    [
      "Methane Emission Mass Flow Rate",
      systemDataTypes.massFlowRate.dataTypeId,
    ],
    ["Methane Gas Screening Value", systemDataTypes.volumeFlowRate.dataTypeId],
    [
      "Carbon Dioxide Gas Screening Value",
      systemDataTypes.volumeFlowRate.dataTypeId,
    ],
    [
      "Dissolved Methane Mass Concentration",
      systemDataTypes.massDensity.dataTypeId,
    ],
    [
      "Atmospheric Pressure Change Rate",
      systemDataTypes.pressureChangeRate.dataTypeId,
    ],
  ])("keeps %s in its intended conversion family", (title, dataTypeId) => {
    expect(acceptedDataType(title)).toBe(dataTypeId);
  });

  it.each([
    "Battery State of Charge",
    "Soil Water Volume Fraction",
    "Carbon Dioxide Mole Fraction",
    "Photovoltaic Conversion Efficiency",
    "Motor Efficiency",
    "Packet Loss Fraction",
    "Bit Error Fraction",
    "Service Availability",
    ...[
      "Methane",
      "Oxygen",
      "Carbon Monoxide",
      "Hydrogen Sulphide",
      "Sulphur Dioxide",
      "Hydrogen",
    ].flatMap((gas) => [`${gas} Mole Fraction`, `${gas} Volume Fraction`]),
    "Carbon Dioxide Volume Fraction",
  ])("uses unit-specific fraction bounds for %s", (title) => {
    expect(acceptedDataType(title)).toBe(
      systemDataTypes.boundedFraction.dataTypeId,
    );
  });

  it("uses whole-number domains for counts and converter resolution", () => {
    for (const title of [
      "Battery Cycle Count",
      "Request Count",
      "Packet Count",
    ]) {
      expect(acceptedDataType(title)).toBe(
        systemDataTypes["non-negativeInteger"].dataTypeId,
      );
    }
    expect(acceptedDataType("ADC Resolution")).toBe(
      systemDataTypes.positiveInteger.dataTypeId,
    );
  });

  it("requires the declared sound weighting instead of a generic sound level", () => {
    expect(
      acceptedDataType("A-weighted Equivalent Continuous Sound Pressure Level"),
    ).toBe(systemDataTypes["decibel(a-weightedSoundPressure)"].dataTypeId);
    expect(acceptedDataType("C-weighted Peak Sound Pressure Level")).toBe(
      systemDataTypes["decibel(c-weightedSoundPressure)"].dataTypeId,
    );
  });
});

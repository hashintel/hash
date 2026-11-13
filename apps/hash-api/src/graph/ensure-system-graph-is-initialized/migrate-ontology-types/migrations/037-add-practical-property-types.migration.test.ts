import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  componentsFromVersionedUrl,
  makeOntologyTypeVersion,
} from "@blockprotocol/type-system";
import {
  systemDataTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { slugifyTypeTitle } from "@local/hash-isomorphic-utils/slugify-type-title";

import { createSystemPropertyTypeIfNotExists } from "../util";
import migrate from "./037-add-practical-property-types.migration";
import { measurementPropertyTypes } from "./037-add-practical-property-types/property-types";

import type { MigrationFunction, MigrationState } from "../types";

vi.mock("../util", () => ({
  createSystemPropertyTypeIfNotExists: vi.fn(),
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
});

describe("practical measurement properties", () => {
  it("uses each installed data-type version and the idempotent property seeder", async () => {
    const migrationState = state();
    expect(await migrate(parameters(migrationState))).toBe(migrationState);
    expect(createSystemPropertyTypeIfNotExists).toHaveBeenCalledTimes(102);
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
        systemDataTypes.nonNegativeInteger.dataTypeId,
      );
    }
    expect(acceptedDataType("ADC Resolution")).toBe(
      systemDataTypes.positiveInteger.dataTypeId,
    );
  });

  it("requires the declared sound weighting instead of a generic sound level", () => {
    expect(
      acceptedDataType("A-weighted Equivalent Continuous Sound Pressure Level"),
    ).toBe(systemDataTypes.decibelsAWeightedSoundPressure.dataTypeId);
    expect(acceptedDataType("C-weighted Peak Sound Pressure Level")).toBe(
      systemDataTypes.decibelsCWeightedSoundPressure.dataTypeId,
    );
  });
});

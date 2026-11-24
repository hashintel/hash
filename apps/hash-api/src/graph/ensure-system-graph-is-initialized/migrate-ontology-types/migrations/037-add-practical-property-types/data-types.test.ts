import { describe, expect, it } from "vitest";

import { createConversionFunction } from "@local/hash-isomorphic-utils/data-types";
import { validateDataAgainstSchema } from "@local/hash-isomorphic-utils/json-utils";
import {
  blockProtocolDataTypes,
  systemDataTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import { measurementDataTypes } from "./data-types";

import type { BaseUrl } from "@blockprotocol/type-system";

const dataType = (title: string) => {
  const item = measurementDataTypes.find(
    ({ definition }) => definition.title === title,
  );
  if (!item) {
    throw new Error(`Missing data type: ${title}`);
  }
  return item;
};

const definitions = {
  number: { id: blockProtocolDataTypes.number.dataTypeId, type: "number" },
  ...Object.fromEntries(
    measurementDataTypes.map(({ dataTypeBaseUrl, definition }) => [
      definition.title,
      { ...definition, id: `${dataTypeBaseUrl}v/1` },
    ]),
  ),
};

describe("environmental measurement units", () => {
  it.each([
    [
      "Microgram per Cubic Meter",
      systemDataTypes.kilogramPerCubicMeter.dataTypeBaseUrl,
      35,
      3.5e-8,
    ],
    [
      "Milligram per Cubic Meter",
      systemDataTypes.kilogramPerCubicMeter.dataTypeBaseUrl,
      12.5,
      1.25e-5,
    ],
    [
      "Reciprocal Cubic Centimeter",
      systemDataTypes.reciprocalCubicMeter.dataTypeBaseUrl,
      12.5,
      12500000,
    ],
    [
      "Liter per Hour",
      systemDataTypes.cubicMeterPerSecond.dataTypeBaseUrl,
      3600,
      0.001,
    ],
    [
      "Milligram per Square Meter Second",
      systemDataTypes.kilogramPerSquareMeterSecond.dataTypeBaseUrl,
      0.001,
      1e-9,
    ],
    [
      "Hectopascal per Hour",
      systemDataTypes.pascalPerSecond.dataTypeBaseUrl,
      -36,
      -1,
    ],
  ] as const)(
    "converts %s in both directions at environmental measurement scales",
    (title, target, value, expected) => {
      const conversion = dataType(title).conversions[target];
      if (!conversion) {
        throw new Error(`Missing conversion: ${title} to ${target}`);
      }
      const to = createConversionFunction([conversion.to]);
      const from = createConversionFunction([conversion.from]);
      expect(to(value) / expected).toBeCloseTo(1, 12);
      expect(from(expected) / value).toBeCloseTo(1, 12);
      expect(from(to(value)) / value).toBeCloseTo(1, 12);
      expect(to(0)).toBe(0);
      expect(from(0)).toBe(0);
      expect(to(-value) / -expected).toBeCloseTo(1, 12);
    },
  );

  it("keeps particle number, mass concentration and surface flux in separate families", () => {
    expect(dataType("Microgram per Cubic Meter").definition.allOf).toEqual([
      { $ref: systemDataTypes["massDensity(metric)"].dataTypeId },
    ]);
    expect(dataType("Reciprocal Cubic Centimeter").definition.allOf).toEqual([
      { $ref: systemDataTypes["numberPerVolume(metric)"].dataTypeId },
    ]);
    expect(
      dataType("Milligram per Square Meter Second").definition.allOf,
    ).toEqual([
      { $ref: systemDataTypes["massFluxDensity(metric)"].dataTypeId },
    ]);
  });

  it("accepts LEL levels above the reference limit without making them gas fractions", () => {
    const lel = dataType("Percentage of Lower Explosive Limit");
    for (const value of [0, 2.5, 100, 125]) {
      expect(
        validateDataAgainstSchema(value, { ...lel.definition, definitions })
          .valid,
        String(value),
      ).toBe(true);
    }
    for (const value of [-1, "20", null]) {
      expect(
        validateDataAgainstSchema(value, { ...lel.definition, definitions })
          .valid,
        String(value),
      ).toBe(false);
    }
    expect(lel.definition.allOf).toEqual([
      { $ref: blockProtocolDataTypes.number.dataTypeId },
    ]);
    expect(lel.conversions).toEqual({});
  });

  it("keeps pressure change rates signed and separate from pressure readings", () => {
    const rate = dataType("Pressure Change Rate");
    const metric = dataType("Pressure Change Rate (Metric)");
    const pascalPerSecond = dataType("Pascal per Second");
    for (const value of [-1, 0, 0.5]) {
      expect(
        validateDataAgainstSchema(value, {
          ...pascalPerSecond.definition,
          definitions,
        }).valid,
      ).toBe(true);
    }
    expect(rate.definition.allOf).toEqual([
      { $ref: blockProtocolDataTypes.number.dataTypeId },
    ]);
    expect(rate.definition.abstract).toBe(true);
    expect(metric.definition.abstract).toBe(true);
    expect(pascalPerSecond.conversions).toEqual({});
  });

  it("registers every added type once with matching singular and plural names", () => {
    const identifiers = new Set<BaseUrl>();
    for (const { dataTypeBaseUrl, definition } of measurementDataTypes) {
      expect(identifiers.has(dataTypeBaseUrl), definition.title).toBe(false);
      identifiers.add(dataTypeBaseUrl);
      const entries = Object.values(systemDataTypes).filter(
        (entry) => entry.dataTypeBaseUrl === dataTypeBaseUrl,
      );
      expect(entries, definition.title).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        title: definition.title,
        titlePlural: definition.titlePlural,
      });
    }
  });
});

import {
  blockProtocolDataTypes,
  systemDataTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import { scaledConversion } from "../shared/conversions";

import type { createSystemDataTypeIfNotExists } from "../../util";
import type { BaseUrl } from "@blockprotocol/type-system";

type Definition = Parameters<typeof createSystemDataTypeIfNotExists>[2];

export type MeasurementDataType = {
  dataTypeBaseUrl: BaseUrl;
  definition: Extract<Definition["dataTypeDefinition"], { type: "number" }> & {
    titlePlural: string;
  };
  conversions: Definition["conversions"];
};

export const measurementDataTypes: MeasurementDataType[] = [
  {
    dataTypeBaseUrl: systemDataTypes.microgramPerCubicMeter.dataTypeBaseUrl,
    definition: {
      title: "Microgram per Cubic Meter",
      titlePlural: "Micrograms per Cubic Meter",
      description:
        "A unit of mass concentration equal to 10^-9 kilograms per cubic meter.",
      type: "number",
      allOf: [{ $ref: systemDataTypes["massDensity(metric)"].dataTypeId }],
      label: { right: "μg/m³" },
    },
    conversions: {
      [systemDataTypes.kilogramPerCubicMeter.dataTypeBaseUrl]: scaledConversion(
        { factor: 1e-9 },
      ),
    },
  },
  {
    dataTypeBaseUrl: systemDataTypes.milligramPerCubicMeter.dataTypeBaseUrl,
    definition: {
      title: "Milligram per Cubic Meter",
      titlePlural: "Milligrams per Cubic Meter",
      description:
        "A unit of mass concentration equal to 10^-6 kilograms per cubic meter.",
      type: "number",
      allOf: [{ $ref: systemDataTypes["massDensity(metric)"].dataTypeId }],
      label: { right: "mg/m³" },
    },
    conversions: {
      [systemDataTypes.kilogramPerCubicMeter.dataTypeBaseUrl]: scaledConversion(
        { factor: 0.000001 },
      ),
    },
  },
  {
    dataTypeBaseUrl: systemDataTypes.reciprocalCubicCentimeter.dataTypeBaseUrl,
    definition: {
      title: "Reciprocal Cubic Centimeter",
      titlePlural: "Reciprocal Cubic Centimeters",
      description:
        "A unit of number concentration equal to one million reciprocal cubic meters.",
      type: "number",
      allOf: [{ $ref: systemDataTypes["numberPerVolume(metric)"].dataTypeId }],
      label: { right: "cm⁻³" },
    },
    conversions: {
      [systemDataTypes.reciprocalCubicMeter.dataTypeBaseUrl]: scaledConversion({
        factor: 1000000,
      }),
    },
  },
  {
    dataTypeBaseUrl: systemDataTypes.literPerHour.dataTypeBaseUrl,
    definition: {
      title: "Liter per Hour",
      titlePlural: "Liters per Hour",
      description:
        "A unit of volume flow rate equal to one liter per 3600 seconds at the stated measurement conditions.",
      type: "number",
      allOf: [{ $ref: systemDataTypes["volumeFlowRate(metric)"].dataTypeId }],
      label: { right: "L/h" },
    },
    conversions: {
      [systemDataTypes.cubicMeterPerSecond.dataTypeBaseUrl]: scaledConversion({
        factor: 0.001,
        divisor: 3600,
      }),
    },
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.milligramPerSquareMeterSecond.dataTypeBaseUrl,
    definition: {
      title: "Milligram per Square Meter Second",
      titlePlural: "Milligrams per Square Meter Second",
      description:
        "A unit of mass flux density equal to 10^-6 kilograms per square meter per second.",
      type: "number",
      allOf: [{ $ref: systemDataTypes["massFluxDensity(metric)"].dataTypeId }],
      label: { right: "mg/(m²·s)" },
    },
    conversions: {
      [systemDataTypes.kilogramPerSquareMeterSecond.dataTypeBaseUrl]:
        scaledConversion({ factor: 0.000001 }),
    },
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.percentageOfLowerExplosiveLimit.dataTypeBaseUrl,
    definition: {
      title: "Percentage of Lower Explosive Limit",
      titlePlural: "Percentages of Lower Explosive Limit",
      description:
        "A combustible gas level relative to a specified lower explosive limit, with 100 representing that limit. The target gas or mixture, calibration gas and reference convention accompany the value.",
      type: "number",
      allOf: [{ $ref: blockProtocolDataTypes.number.dataTypeId }],
      label: { right: "% LEL" },
      minimum: 0,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.pressureChangeRate.dataTypeBaseUrl,
    definition: {
      title: "Pressure Change Rate",
      titlePlural: "Pressure Change Rates",
      description:
        "Numeric values in convertible units of pressure change divided by elapsed time.",
      type: "number",
      allOf: [{ $ref: blockProtocolDataTypes.number.dataTypeId }],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes["pressureChangeRate(metric)"].dataTypeBaseUrl,
    definition: {
      title: "Pressure Change Rate (Metric)",
      titlePlural: "Pressure Change Rates (Metric)",
      description: "Pressure change rates expressed in metric units.",
      type: "number",
      allOf: [{ $ref: systemDataTypes.pressureChangeRate.dataTypeId }],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.pascalPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Pascal per Second",
      titlePlural: "Pascals per Second",
      description:
        "A unit of pressure change rate equal to one pascal per second.",
      type: "number",
      allOf: [
        { $ref: systemDataTypes["pressureChangeRate(metric)"].dataTypeId },
      ],
      label: { right: "Pa/s" },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.hectopascalPerHour.dataTypeBaseUrl,
    definition: {
      title: "Hectopascal per Hour",
      titlePlural: "Hectopascals per Hour",
      description:
        "A unit of pressure change rate equal to 100 pascals per 3600 seconds.",
      type: "number",
      allOf: [
        { $ref: systemDataTypes["pressureChangeRate(metric)"].dataTypeId },
      ],
      label: { right: "hPa/h" },
    },
    conversions: {
      [systemDataTypes.pascalPerSecond.dataTypeBaseUrl]: scaledConversion({
        factor: 100,
        divisor: 3600,
      }),
    },
  },
];

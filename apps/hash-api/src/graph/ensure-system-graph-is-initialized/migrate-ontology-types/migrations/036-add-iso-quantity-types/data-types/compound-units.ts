import { systemDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { IsoDataType } from "../data-types";

export const compoundUnitsDataTypes: IsoDataType[] = [
  {
    dataTypeBaseUrl: systemDataTypes.linearMassDensity.dataTypeBaseUrl,
    definition: {
      title: "Linear Mass Density",
      titlePlural: "Linear Mass Densities",
      description:
        "Numeric values in convertible units of linear mass density.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.linearMassDensityMetric.dataTypeBaseUrl,
    definition: {
      title: "Linear Mass Density (Metric)",
      titlePlural: "Linear Mass Densities (Metric)",
      description:
        "Linear Mass Density expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.linearMassDensity.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.kilogramsPerMeter.dataTypeBaseUrl,
    definition: {
      title: "Kilogram per Meter",
      titlePlural: "Kilograms per Meter",
      description: "A value expressed in kilograms per meter.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.linearMassDensityMetric.dataTypeId,
        },
      ],
      label: {
        right: "kg/m",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.momentOfInertia.dataTypeBaseUrl,
    definition: {
      title: "Moment of Inertia",
      titlePlural: "Moments of Inertia",
      description: "Numeric values in convertible units of moment of inertia.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.momentOfInertiaMetric.dataTypeBaseUrl,
    definition: {
      title: "Moment of Inertia (Metric)",
      titlePlural: "Moments of Inertia (Metric)",
      description:
        "Moment of Inertia expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.momentOfInertia.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.kilogramSquareMeters.dataTypeBaseUrl,
    definition: {
      title: "Kilogram Square Meter",
      titlePlural: "Kilogram Square Meters",
      description: "A value expressed in kilogram square meters.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.momentOfInertiaMetric.dataTypeId,
        },
      ],
      label: {
        right: "kg·m²",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.momentum.dataTypeBaseUrl,
    definition: {
      title: "Momentum",
      titlePlural: "Momenta",
      description: "Numeric values in convertible units of momentum.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.momentumMetric.dataTypeBaseUrl,
    definition: {
      title: "Momentum (Metric)",
      titlePlural: "Momenta (Metric)",
      description: "Momentum expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.momentum.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.kilogramMetersPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Kilogram Meter per Second",
      titlePlural: "Kilogram Meters per Second",
      description: "A value expressed in kilogram meters per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.momentumMetric.dataTypeId,
        },
      ],
      label: {
        right: "kg·m/s",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.impulse.dataTypeBaseUrl,
    definition: {
      title: "Impulse",
      titlePlural: "Impulses",
      description: "Numeric values in convertible units of impulse.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.impulseMetric.dataTypeBaseUrl,
    definition: {
      title: "Impulse (Metric)",
      titlePlural: "Impulses (Metric)",
      description: "Impulse expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.impulse.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.newtonSeconds.dataTypeBaseUrl,
    definition: {
      title: "Newton Second",
      titlePlural: "Newton Seconds",
      description: "A value expressed in newton seconds.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.impulseMetric.dataTypeId,
        },
      ],
      label: {
        right: "N·s",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.angularMomentum.dataTypeBaseUrl,
    definition: {
      title: "Angular Momentum",
      titlePlural: "Angular Momenta",
      description: "Numeric values in convertible units of angular momentum.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.angularMomentumMetric.dataTypeBaseUrl,
    definition: {
      title: "Angular Momentum (Metric)",
      titlePlural: "Angular Momenta (Metric)",
      description:
        "Angular Momentum expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.angularMomentum.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.kilogramSquareMetersPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Kilogram Square Meter per Second",
      titlePlural: "Kilogram Square Meters per Second",
      description: "A value expressed in kilogram square meters per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.angularMomentumMetric.dataTypeId,
        },
      ],
      label: {
        right: "kg·m²/s",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.angularImpulse.dataTypeBaseUrl,
    definition: {
      title: "Angular Impulse",
      titlePlural: "Angular Impulses",
      description: "Numeric values in convertible units of angular impulse.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.angularImpulseMetric.dataTypeBaseUrl,
    definition: {
      title: "Angular Impulse (Metric)",
      titlePlural: "Angular Impulses (Metric)",
      description:
        "Angular Impulse expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.angularImpulse.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.newtonMeterSeconds.dataTypeBaseUrl,
    definition: {
      title: "Newton Meter Second",
      titlePlural: "Newton Meter Seconds",
      description: "A value expressed in newton meter seconds.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.angularImpulseMetric.dataTypeId,
        },
      ],
      label: {
        right: "N·m·s",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.action.dataTypeBaseUrl,
    definition: {
      title: "Action",
      titlePlural: "Actions",
      description: "Numeric values in convertible units of action.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.actionMetric.dataTypeBaseUrl,
    definition: {
      title: "Action (Metric)",
      titlePlural: "Actions (Metric)",
      description: "Action expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.action.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.jouleSeconds.dataTypeBaseUrl,
    definition: {
      title: "Joule Second",
      titlePlural: "Joule Seconds",
      description: "A value expressed in joule seconds.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.actionMetric.dataTypeId,
        },
      ],
      label: {
        right: "J·s",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.reciprocalPressure.dataTypeBaseUrl,
    definition: {
      title: "Reciprocal Pressure",
      titlePlural: "Reciprocal Pressures",
      description:
        "Numeric values in convertible units of reciprocal pressure.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.reciprocalPressureMetric.dataTypeBaseUrl,
    definition: {
      title: "Reciprocal Pressure (Metric)",
      titlePlural: "Reciprocal Pressures (Metric)",
      description:
        "Reciprocal Pressure expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.reciprocalPressure.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.reciprocalPascals.dataTypeBaseUrl,
    definition: {
      title: "Reciprocal Pascal",
      titlePlural: "Reciprocal Pascals",
      description: "A value expressed in reciprocal pascals.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.reciprocalPressureMetric.dataTypeId,
        },
      ],
      label: {
        right: "Pa⁻¹",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.fourthPowerOfLength.dataTypeBaseUrl,
    definition: {
      title: "Fourth Power of Length",
      titlePlural: "Fourth Powers of Length",
      description:
        "Numeric values in convertible units of fourth power of length.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.fourthPowerOfLengthMetric.dataTypeBaseUrl,
    definition: {
      title: "Fourth Power of Length (Metric)",
      titlePlural: "Fourth Powers of Length (Metric)",
      description:
        "Fourth Power of Length expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.fourthPowerOfLength.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.metersToTheFourthPower.dataTypeBaseUrl,
    definition: {
      title: "Meter to the Fourth Power",
      titlePlural: "Meters to the Fourth Power",
      description: "A value expressed in meters to the fourth power.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.fourthPowerOfLengthMetric.dataTypeId,
        },
      ],
      label: {
        right: "m⁴",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.massFluxDensity.dataTypeBaseUrl,
    definition: {
      title: "Mass Flux Density",
      titlePlural: "Mass Flux Densities",
      description: "Numeric values in convertible units of mass flux density.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.massFluxDensityMetric.dataTypeBaseUrl,
    definition: {
      title: "Mass Flux Density (Metric)",
      titlePlural: "Mass Flux Densities (Metric)",
      description:
        "Mass Flux Density expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.massFluxDensity.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.kilogramsPerSquareMeterSecond.dataTypeBaseUrl,
    definition: {
      title: "Kilogram per Square Meter Second",
      titlePlural: "Kilograms per Square Meter Second",
      description: "A value expressed in kilograms per square meter second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.massFluxDensityMetric.dataTypeId,
        },
      ],
      label: {
        right: "kg/(m²·s)",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.massFlowRate.dataTypeBaseUrl,
    definition: {
      title: "Mass Flow Rate",
      titlePlural: "Mass Flow Rates",
      description: "Numeric values in convertible units of mass flow rate.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.massFlowRateMetric.dataTypeBaseUrl,
    definition: {
      title: "Mass Flow Rate (Metric)",
      titlePlural: "Mass Flow Rates (Metric)",
      description: "Mass Flow Rate expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.massFlowRate.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.kilogramsPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Kilogram per Second",
      titlePlural: "Kilograms per Second",
      description: "A value expressed in kilograms per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.massFlowRateMetric.dataTypeId,
        },
      ],
      label: {
        right: "kg/s",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.reciprocalTemperatureInterval.dataTypeBaseUrl,
    definition: {
      title: "Reciprocal Temperature Interval",
      titlePlural: "Reciprocal Temperature Intervals",
      description:
        "Numeric values in convertible units of reciprocal temperature interval.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.reciprocalTemperatureIntervalMetric.dataTypeBaseUrl,
    definition: {
      title: "Reciprocal Temperature Interval (Metric)",
      titlePlural: "Reciprocal Temperature Intervals (Metric)",
      description:
        "Reciprocal Temperature Interval expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.reciprocalTemperatureInterval.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.reciprocalKelvins.dataTypeBaseUrl,
    definition: {
      title: "Reciprocal Kelvin",
      titlePlural: "Reciprocal Kelvins",
      description: "A value expressed in reciprocal kelvins.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.reciprocalTemperatureIntervalMetric.dataTypeId,
        },
      ],
      label: {
        right: "K⁻¹",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.pressurePerTemperatureInterval.dataTypeBaseUrl,
    definition: {
      title: "Pressure per Temperature Interval",
      titlePlural: "Pressures per Temperature Interval",
      description:
        "Numeric values in convertible units of pressure per temperature interval.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.pressurePerTemperatureIntervalMetric.dataTypeBaseUrl,
    definition: {
      title: "Pressure per Temperature Interval (Metric)",
      titlePlural: "Pressures per Temperature Interval (Metric)",
      description:
        "Pressure per Temperature Interval expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.pressurePerTemperatureInterval.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.pascalsPerKelvin.dataTypeBaseUrl,
    definition: {
      title: "Pascal per Kelvin",
      titlePlural: "Pascals per Kelvin",
      description: "A value expressed in pascals per kelvin.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.pressurePerTemperatureIntervalMetric.dataTypeId,
        },
      ],
      label: {
        right: "Pa/K",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.heatTransferCoefficient.dataTypeBaseUrl,
    definition: {
      title: "Heat Transfer Coefficient",
      titlePlural: "Heat Transfer Coefficients",
      description:
        "Numeric values in convertible units of heat transfer coefficient.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.heatTransferCoefficientMetric.dataTypeBaseUrl,
    definition: {
      title: "Heat Transfer Coefficient (Metric)",
      titlePlural: "Heat Transfer Coefficients (Metric)",
      description:
        "Heat Transfer Coefficient expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.heatTransferCoefficient.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.wattsPerSquareMeterKelvin.dataTypeBaseUrl,
    definition: {
      title: "Watt per Square Meter Kelvin",
      titlePlural: "Watts per Square Meter Kelvin",
      description: "A value expressed in watts per square meter kelvin.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.heatTransferCoefficientMetric.dataTypeId,
        },
      ],
      label: {
        right: "W/(m²·K)",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.thermalInsulance.dataTypeBaseUrl,
    definition: {
      title: "Thermal Insulance",
      titlePlural: "Thermal Insulances",
      description: "Numeric values in convertible units of thermal insulance.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.thermalInsulanceMetric.dataTypeBaseUrl,
    definition: {
      title: "Thermal Insulance (Metric)",
      titlePlural: "Thermal Insulances (Metric)",
      description:
        "Thermal Insulance expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.thermalInsulance.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.squareMeterKelvinsPerWatt.dataTypeBaseUrl,
    definition: {
      title: "Square Meter Kelvin per Watt",
      titlePlural: "Square Meter Kelvins per Watt",
      description: "A value expressed in square meter kelvins per watt.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.thermalInsulanceMetric.dataTypeId,
        },
      ],
      label: {
        right: "m²·K/W",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.thermalResistance.dataTypeBaseUrl,
    definition: {
      title: "Thermal Resistance",
      titlePlural: "Thermal Resistances",
      description: "Numeric values in convertible units of thermal resistance.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.thermalResistanceMetric.dataTypeBaseUrl,
    definition: {
      title: "Thermal Resistance (Metric)",
      titlePlural: "Thermal Resistances (Metric)",
      description:
        "Thermal Resistance expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.thermalResistance.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.kelvinsPerWatt.dataTypeBaseUrl,
    definition: {
      title: "Kelvin per Watt",
      titlePlural: "Kelvins per Watt",
      description: "A value expressed in kelvins per watt.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.thermalResistanceMetric.dataTypeId,
        },
      ],
      label: {
        right: "K/W",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.thermalConductance.dataTypeBaseUrl,
    definition: {
      title: "Thermal Conductance",
      titlePlural: "Thermal Conductances",
      description:
        "Numeric values in convertible units of thermal conductance.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.thermalConductanceMetric.dataTypeBaseUrl,
    definition: {
      title: "Thermal Conductance (Metric)",
      titlePlural: "Thermal Conductances (Metric)",
      description:
        "Thermal Conductance expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.thermalConductance.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.wattsPerKelvin.dataTypeBaseUrl,
    definition: {
      title: "Watt per Kelvin",
      titlePlural: "Watts per Kelvin",
      description: "A value expressed in watts per kelvin.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.thermalConductanceMetric.dataTypeId,
        },
      ],
      label: {
        right: "W/K",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.temperatureIntervalPerPressure.dataTypeBaseUrl,
    definition: {
      title: "Temperature Interval per Pressure",
      titlePlural: "Temperature Intervals per Pressure",
      description:
        "Numeric values in convertible units of temperature interval per pressure.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.temperatureIntervalPerPressureMetric.dataTypeBaseUrl,
    definition: {
      title: "Temperature Interval per Pressure (Metric)",
      titlePlural: "Temperature Intervals per Pressure (Metric)",
      description:
        "Temperature Interval per Pressure expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.temperatureIntervalPerPressure.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.kelvinsPerPascal.dataTypeBaseUrl,
    definition: {
      title: "Kelvin per Pascal",
      titlePlural: "Kelvins per Pascal",
      description: "A value expressed in kelvins per pascal.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.temperatureIntervalPerPressureMetric.dataTypeId,
        },
      ],
      label: {
        right: "K/Pa",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.linearChargeDensity.dataTypeBaseUrl,
    definition: {
      title: "Linear Charge Density",
      titlePlural: "Linear Charge Densities",
      description:
        "Numeric values in convertible units of linear charge density.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.linearChargeDensityMetric.dataTypeBaseUrl,
    definition: {
      title: "Linear Charge Density (Metric)",
      titlePlural: "Linear Charge Densities (Metric)",
      description:
        "Linear Charge Density expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.linearChargeDensity.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.coulombsPerMeter.dataTypeBaseUrl,
    definition: {
      title: "Coulomb per Meter",
      titlePlural: "Coulombs per Meter",
      description: "A value expressed in coulombs per meter.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.linearChargeDensityMetric.dataTypeId,
        },
      ],
      label: {
        right: "C/m",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.electricDipoleMoment.dataTypeBaseUrl,
    definition: {
      title: "Electric Dipole Moment",
      titlePlural: "Electric Dipole Moments",
      description:
        "Numeric values in convertible units of electric dipole moment.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.electricDipoleMomentMetric.dataTypeBaseUrl,
    definition: {
      title: "Electric Dipole Moment (Metric)",
      titlePlural: "Electric Dipole Moments (Metric)",
      description:
        "Electric Dipole Moment expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.electricDipoleMoment.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.coulombMeters.dataTypeBaseUrl,
    definition: {
      title: "Coulomb Meter",
      titlePlural: "Coulomb Meters",
      description: "A value expressed in coulomb meters.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.electricDipoleMomentMetric.dataTypeId,
        },
      ],
      label: {
        right: "C·m",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.magneticMoment.dataTypeBaseUrl,
    definition: {
      title: "Magnetic Moment",
      titlePlural: "Magnetic Moments",
      description: "Numeric values in convertible units of magnetic moment.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.magneticMomentMetric.dataTypeBaseUrl,
    definition: {
      title: "Magnetic Moment (Metric)",
      titlePlural: "Magnetic Moments (Metric)",
      description:
        "Magnetic Moment expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.magneticMoment.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.ampereSquareMeters.dataTypeBaseUrl,
    definition: {
      title: "Ampere Square Meter",
      titlePlural: "Ampere Square Meters",
      description: "A value expressed in ampere square meters.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.magneticMomentMetric.dataTypeId,
        },
      ],
      label: {
        right: "A·m²",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.magneticDipoleMoment.dataTypeBaseUrl,
    definition: {
      title: "Magnetic Dipole Moment",
      titlePlural: "Magnetic Dipole Moments",
      description:
        "Numeric values in convertible units of magnetic dipole moment.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.magneticDipoleMomentMetric.dataTypeBaseUrl,
    definition: {
      title: "Magnetic Dipole Moment (Metric)",
      titlePlural: "Magnetic Dipole Moments (Metric)",
      description:
        "Magnetic Dipole Moment expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.magneticDipoleMoment.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.weberMeters.dataTypeBaseUrl,
    definition: {
      title: "Weber Meter",
      titlePlural: "Weber Meters",
      description: "A value expressed in weber meters.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.magneticDipoleMomentMetric.dataTypeId,
        },
      ],
      label: {
        right: "Wb·m",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.magneticVectorPotential.dataTypeBaseUrl,
    definition: {
      title: "Magnetic Vector Potential",
      titlePlural: "Magnetic Vector Potentials",
      description:
        "Numeric values in convertible units of magnetic vector potential.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.magneticVectorPotentialMetric.dataTypeBaseUrl,
    definition: {
      title: "Magnetic Vector Potential (Metric)",
      titlePlural: "Magnetic Vector Potentials (Metric)",
      description:
        "Magnetic Vector Potential expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.magneticVectorPotential.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.webersPerMeter.dataTypeBaseUrl,
    definition: {
      title: "Weber per Meter",
      titlePlural: "Webers per Meter",
      description: "A value expressed in webers per meter.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.magneticVectorPotentialMetric.dataTypeId,
        },
      ],
      label: {
        right: "Wb/m",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.magneticReluctance.dataTypeBaseUrl,
    definition: {
      title: "Magnetic Reluctance",
      titlePlural: "Magnetic Reluctances",
      description:
        "Numeric values in convertible units of magnetic reluctance.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.magneticReluctanceMetric.dataTypeBaseUrl,
    definition: {
      title: "Magnetic Reluctance (Metric)",
      titlePlural: "Magnetic Reluctances (Metric)",
      description:
        "Magnetic Reluctance expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.magneticReluctance.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.reciprocalHenries.dataTypeBaseUrl,
    definition: {
      title: "Reciprocal Henry",
      titlePlural: "Reciprocal Henries",
      description: "A value expressed in reciprocal henries.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.magneticReluctanceMetric.dataTypeId,
        },
      ],
      label: {
        right: "H⁻¹",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.electricConductivity.dataTypeBaseUrl,
    definition: {
      title: "Electric Conductivity",
      titlePlural: "Electric Conductivities",
      description:
        "Numeric values in convertible units of electric conductivity.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.electricConductivityMetric.dataTypeBaseUrl,
    definition: {
      title: "Electric Conductivity (Metric)",
      titlePlural: "Electric Conductivities (Metric)",
      description:
        "Electric Conductivity expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.electricConductivity.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.siemensPerMeter.dataTypeBaseUrl,
    definition: {
      title: "Siemens per Meter",
      titlePlural: "Siemens per Meter",
      description: "A value expressed in siemens per meter.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.electricConductivityMetric.dataTypeId,
        },
      ],
      label: {
        right: "S/m",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.electricResistivity.dataTypeBaseUrl,
    definition: {
      title: "Electric Resistivity",
      titlePlural: "Electric Resistivities",
      description:
        "Numeric values in convertible units of electric resistivity.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.electricResistivityMetric.dataTypeBaseUrl,
    definition: {
      title: "Electric Resistivity (Metric)",
      titlePlural: "Electric Resistivities (Metric)",
      description:
        "Electric Resistivity expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.electricResistivity.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.ohmMeters.dataTypeBaseUrl,
    definition: {
      title: "Ohm Meter",
      titlePlural: "Ohm Meters",
      description: "A value expressed in ohm meters.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.electricResistivityMetric.dataTypeId,
        },
      ],
      label: {
        right: "Ω·m",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.apparentPower.dataTypeBaseUrl,
    definition: {
      title: "Apparent Power",
      titlePlural: "Apparent Powers",
      description: "Numeric values in convertible units of apparent power.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.apparentPowerMetric.dataTypeBaseUrl,
    definition: {
      title: "Apparent Power (Metric)",
      titlePlural: "Apparent Powers (Metric)",
      description: "Apparent Power expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.apparentPower.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.voltAmperes.dataTypeBaseUrl,
    definition: {
      title: "Volt Ampere",
      titlePlural: "Volt Amperes",
      description: "A value expressed in volt amperes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.apparentPowerMetric.dataTypeId,
        },
      ],
      label: {
        right: "VA",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.reactivePower.dataTypeBaseUrl,
    definition: {
      title: "Reactive Power",
      titlePlural: "Reactive Powers",
      description: "Numeric values in convertible units of reactive power.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.reactivePowerMetric.dataTypeBaseUrl,
    definition: {
      title: "Reactive Power (Metric)",
      titlePlural: "Reactive Powers (Metric)",
      description: "Reactive Power expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.reactivePower.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.vars.dataTypeBaseUrl,
    definition: {
      title: "Var",
      titlePlural: "Vars",
      description: "A value expressed in vars.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.reactivePowerMetric.dataTypeId,
        },
      ],
      label: {
        right: "var",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.energyPerArea.dataTypeBaseUrl,
    definition: {
      title: "Energy per Area",
      titlePlural: "Energies per Area",
      description: "Numeric values in convertible units of energy per area.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.energyPerAreaMetric.dataTypeBaseUrl,
    definition: {
      title: "Energy per Area (Metric)",
      titlePlural: "Energies per Area (Metric)",
      description:
        "Energy per Area expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.energyPerArea.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.joulesPerSquareMeter.dataTypeBaseUrl,
    definition: {
      title: "Joule per Square Meter",
      titlePlural: "Joules per Square Meter",
      description: "A value expressed in joules per square meter.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.energyPerAreaMetric.dataTypeId,
        },
      ],
      label: {
        right: "J/m²",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.luminousEfficacy.dataTypeBaseUrl,
    definition: {
      title: "Luminous Efficacy",
      titlePlural: "Luminous Efficacies",
      description: "Numeric values in convertible units of luminous efficacy.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.luminousEfficacyMetric.dataTypeBaseUrl,
    definition: {
      title: "Luminous Efficacy (Metric)",
      titlePlural: "Luminous Efficacies (Metric)",
      description:
        "Luminous Efficacy expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.luminousEfficacy.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.lumensPerWatt.dataTypeBaseUrl,
    definition: {
      title: "Lumen per Watt",
      titlePlural: "Lumens per Watt",
      description: "A value expressed in lumens per watt.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.luminousEfficacyMetric.dataTypeId,
        },
      ],
      label: {
        right: "lm/W",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.luminousEnergy.dataTypeBaseUrl,
    definition: {
      title: "Luminous Energy",
      titlePlural: "Luminous Energies",
      description: "Numeric values in convertible units of luminous energy.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.luminousEnergyMetric.dataTypeBaseUrl,
    definition: {
      title: "Luminous Energy (Metric)",
      titlePlural: "Luminous Energies (Metric)",
      description:
        "Luminous Energy expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.luminousEnergy.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.lumenSeconds.dataTypeBaseUrl,
    definition: {
      title: "Lumen Second",
      titlePlural: "Lumen Seconds",
      description: "A value expressed in lumen seconds.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.luminousEnergyMetric.dataTypeId,
        },
      ],
      label: {
        right: "lm·s",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.luminousExposure.dataTypeBaseUrl,
    definition: {
      title: "Luminous Exposure",
      titlePlural: "Luminous Exposures",
      description: "Numeric values in convertible units of luminous exposure.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.luminousExposureMetric.dataTypeBaseUrl,
    definition: {
      title: "Luminous Exposure (Metric)",
      titlePlural: "Luminous Exposures (Metric)",
      description:
        "Luminous Exposure expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.luminousExposure.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.luxSeconds.dataTypeBaseUrl,
    definition: {
      title: "Lux Second",
      titlePlural: "Lux Seconds",
      description: "A value expressed in lux seconds.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.luminousExposureMetric.dataTypeId,
        },
      ],
      label: {
        right: "lx·s",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.reciprocalDuration.dataTypeBaseUrl,
    definition: {
      title: "Reciprocal Duration",
      titlePlural: "Reciprocal Durations",
      description:
        "Numeric values in convertible units of reciprocal duration.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.reciprocalDurationMetric.dataTypeBaseUrl,
    definition: {
      title: "Reciprocal Duration (Metric)",
      titlePlural: "Reciprocal Durations (Metric)",
      description:
        "Reciprocal Duration expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.reciprocalDuration.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.reciprocalSeconds.dataTypeBaseUrl,
    definition: {
      title: "Reciprocal Second",
      titlePlural: "Reciprocal Seconds",
      description: "A value expressed in reciprocal seconds.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.reciprocalDurationMetric.dataTypeId,
        },
      ],
      label: {
        right: "s⁻¹",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.particleIntensity.dataTypeBaseUrl,
    definition: {
      title: "Particle Intensity",
      titlePlural: "Particle Intensities",
      description: "Numeric values in convertible units of particle intensity.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.particleIntensityMetric.dataTypeBaseUrl,
    definition: {
      title: "Particle Intensity (Metric)",
      titlePlural: "Particle Intensities (Metric)",
      description:
        "Particle Intensity expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.particleIntensity.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.reciprocalSecondSteradians.dataTypeBaseUrl,
    definition: {
      title: "Reciprocal Second Steradian",
      titlePlural: "Reciprocal Second Steradians",
      description: "A value expressed in reciprocal second steradians.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.particleIntensityMetric.dataTypeId,
        },
      ],
      label: {
        right: "s⁻¹·sr⁻¹",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.particleRadiance.dataTypeBaseUrl,
    definition: {
      title: "Particle Radiance",
      titlePlural: "Particle Radiances",
      description: "Numeric values in convertible units of particle radiance.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.particleRadianceMetric.dataTypeBaseUrl,
    definition: {
      title: "Particle Radiance (Metric)",
      titlePlural: "Particle Radiances (Metric)",
      description:
        "Particle Radiance expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.particleRadiance.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.reciprocalSquareMeterSecondSteradians.dataTypeBaseUrl,
    definition: {
      title: "Reciprocal Square Meter Second Steradian",
      titlePlural: "Reciprocal Square Meter Second Steradians",
      description:
        "A value expressed in reciprocal square meter second steradians.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.particleRadianceMetric.dataTypeId,
        },
      ],
      label: {
        right: "m⁻²·s⁻¹·sr⁻¹",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.particleFluxDensity.dataTypeBaseUrl,
    definition: {
      title: "Particle Flux Density",
      titlePlural: "Particle Flux Densities",
      description:
        "Numeric values in convertible units of particle flux density.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.particleFluxDensityMetric.dataTypeBaseUrl,
    definition: {
      title: "Particle Flux Density (Metric)",
      titlePlural: "Particle Flux Densities (Metric)",
      description:
        "Particle Flux Density expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.particleFluxDensity.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.reciprocalSquareMeterSeconds.dataTypeBaseUrl,
    definition: {
      title: "Reciprocal Square Meter Second",
      titlePlural: "Reciprocal Square Meter Seconds",
      description: "A value expressed in reciprocal square meter seconds.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.particleFluxDensityMetric.dataTypeId,
        },
      ],
      label: {
        right: "m⁻²·s⁻¹",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.numberPerArea.dataTypeBaseUrl,
    definition: {
      title: "Number per Area",
      titlePlural: "Numbers per Area",
      description: "Numeric values in convertible units of number per area.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.numberPerAreaMetric.dataTypeBaseUrl,
    definition: {
      title: "Number per Area (Metric)",
      titlePlural: "Numbers per Area (Metric)",
      description:
        "Number per Area expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.numberPerArea.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.reciprocalSquareMeters.dataTypeBaseUrl,
    definition: {
      title: "Reciprocal Square Meter",
      titlePlural: "Reciprocal Square Meters",
      description: "A value expressed in reciprocal square meters.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.numberPerAreaMetric.dataTypeId,
        },
      ],
      label: {
        right: "m⁻²",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.areaPerMass.dataTypeBaseUrl,
    definition: {
      title: "Area per Mass",
      titlePlural: "Areas per Mass",
      description: "Numeric values in convertible units of area per mass.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.areaPerMassMetric.dataTypeBaseUrl,
    definition: {
      title: "Area per Mass (Metric)",
      titlePlural: "Areas per Mass (Metric)",
      description: "Area per Mass expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.areaPerMass.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.squareMetersPerKilogram.dataTypeBaseUrl,
    definition: {
      title: "Square Meter per Kilogram",
      titlePlural: "Square Meters per Kilogram",
      description: "A value expressed in square meters per kilogram.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.areaPerMassMetric.dataTypeId,
        },
      ],
      label: {
        right: "kg⁻¹·m²",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.areaPerAmount.dataTypeBaseUrl,
    definition: {
      title: "Area per Amount",
      titlePlural: "Areas per Amount",
      description: "Numeric values in convertible units of area per amount.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.areaPerAmountMetric.dataTypeBaseUrl,
    definition: {
      title: "Area per Amount (Metric)",
      titlePlural: "Areas per Amount (Metric)",
      description:
        "Area per Amount expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.areaPerAmount.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.squareMetersPerMole.dataTypeBaseUrl,
    definition: {
      title: "Square Meter per Mole",
      titlePlural: "Square Meters per Mole",
      description: "A value expressed in square meters per mole.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.areaPerAmountMetric.dataTypeId,
        },
      ],
      label: {
        right: "m²/mol",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.soundExposure.dataTypeBaseUrl,
    definition: {
      title: "Sound Exposure",
      titlePlural: "Sound Exposures",
      description: "Numeric values in convertible units of sound exposure.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.soundExposureMetric.dataTypeBaseUrl,
    definition: {
      title: "Sound Exposure (Metric)",
      titlePlural: "Sound Exposures (Metric)",
      description: "Sound Exposure expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.soundExposure.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.pascalSquaredSeconds.dataTypeBaseUrl,
    definition: {
      title: "Pascal Squared Second",
      titlePlural: "Pascal Squared Seconds",
      description: "A value expressed in pascal squared seconds.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.soundExposureMetric.dataTypeId,
        },
      ],
      label: {
        right: "Pa²·s",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.specificAcousticImpedance.dataTypeBaseUrl,
    definition: {
      title: "Specific Acoustic Impedance",
      titlePlural: "Specific Acoustic Impedances",
      description:
        "Numeric values in convertible units of specific acoustic impedance.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.specificAcousticImpedanceMetric.dataTypeBaseUrl,
    definition: {
      title: "Specific Acoustic Impedance (Metric)",
      titlePlural: "Specific Acoustic Impedances (Metric)",
      description:
        "Specific Acoustic Impedance expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.specificAcousticImpedance.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.pascalSecondsPerMeter.dataTypeBaseUrl,
    definition: {
      title: "Pascal Second per Meter",
      titlePlural: "Pascal Seconds per Meter",
      description: "A value expressed in pascal seconds per meter.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.specificAcousticImpedanceMetric.dataTypeId,
        },
      ],
      label: {
        right: "Pa·s/m",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.acousticImpedance.dataTypeBaseUrl,
    definition: {
      title: "Acoustic Impedance",
      titlePlural: "Acoustic Impedances",
      description: "Numeric values in convertible units of acoustic impedance.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.acousticImpedanceMetric.dataTypeBaseUrl,
    definition: {
      title: "Acoustic Impedance (Metric)",
      titlePlural: "Acoustic Impedances (Metric)",
      description:
        "Acoustic Impedance expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.acousticImpedance.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.pascalSecondsPerCubicMeter.dataTypeBaseUrl,
    definition: {
      title: "Pascal Second per Cubic Meter",
      titlePlural: "Pascal Seconds per Cubic Meter",
      description: "A value expressed in pascal seconds per cubic meter.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.acousticImpedanceMetric.dataTypeId,
        },
      ],
      label: {
        right: "Pa·s/m³",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.molarMass.dataTypeBaseUrl,
    definition: {
      title: "Molar Mass",
      titlePlural: "Molar Masses",
      description: "Numeric values in convertible units of molar mass.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.molarMassMetric.dataTypeBaseUrl,
    definition: {
      title: "Molar Mass (Metric)",
      titlePlural: "Molar Masses (Metric)",
      description: "Molar Mass expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.molarMass.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.kilogramsPerMole.dataTypeBaseUrl,
    definition: {
      title: "Kilogram per Mole",
      titlePlural: "Kilograms per Mole",
      description: "A value expressed in kilograms per mole.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.molarMassMetric.dataTypeId,
        },
      ],
      label: {
        right: "kg/mol",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.molarVolume.dataTypeBaseUrl,
    definition: {
      title: "Molar Volume",
      titlePlural: "Molar Volumes",
      description: "Numeric values in convertible units of molar volume.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.molarVolumeMetric.dataTypeBaseUrl,
    definition: {
      title: "Molar Volume (Metric)",
      titlePlural: "Molar Volumes (Metric)",
      description: "Molar Volume expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.molarVolume.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.cubicMetersPerMole.dataTypeBaseUrl,
    definition: {
      title: "Cubic Meter per Mole",
      titlePlural: "Cubic Meters per Mole",
      description: "A value expressed in cubic meters per mole.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.molarVolumeMetric.dataTypeId,
        },
      ],
      label: {
        right: "m³/mol",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.numberPerVolume.dataTypeBaseUrl,
    definition: {
      title: "Number per Volume",
      titlePlural: "Numbers per Volume",
      description: "Numeric values in convertible units of number per volume.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.numberPerVolumeMetric.dataTypeBaseUrl,
    definition: {
      title: "Number per Volume (Metric)",
      titlePlural: "Numbers per Volume (Metric)",
      description:
        "Number per Volume expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.numberPerVolume.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.reciprocalCubicMeters.dataTypeBaseUrl,
    definition: {
      title: "Reciprocal Cubic Meter",
      titlePlural: "Reciprocal Cubic Meters",
      description: "A value expressed in reciprocal cubic meters.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.numberPerVolumeMetric.dataTypeId,
        },
      ],
      label: {
        right: "m⁻³",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.molality.dataTypeBaseUrl,
    definition: {
      title: "Molality",
      titlePlural: "Molalities",
      description: "Numeric values in convertible units of molality.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.molalityMetric.dataTypeBaseUrl,
    definition: {
      title: "Molality (Metric)",
      titlePlural: "Molalities (Metric)",
      description: "Molality expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.molality.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.molesPerKilogram.dataTypeBaseUrl,
    definition: {
      title: "Mole per Kilogram",
      titlePlural: "Moles per Kilogram",
      description: "A value expressed in moles per kilogram.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.molalityMetric.dataTypeId,
        },
      ],
      label: {
        right: "mol/kg",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.molarConductivity.dataTypeBaseUrl,
    definition: {
      title: "Molar Conductivity",
      titlePlural: "Molar Conductivities",
      description: "Numeric values in convertible units of molar conductivity.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.molarConductivityMetric.dataTypeBaseUrl,
    definition: {
      title: "Molar Conductivity (Metric)",
      titlePlural: "Molar Conductivities (Metric)",
      description:
        "Molar Conductivity expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.molarConductivity.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.siemensSquareMetersPerMole.dataTypeBaseUrl,
    definition: {
      title: "Siemens Square Meter per Mole",
      titlePlural: "Siemens Square Meters per Mole",
      description: "A value expressed in siemens square meters per mole.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.molarConductivityMetric.dataTypeId,
        },
      ],
      label: {
        right: "S·m²/mol",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.molarOpticalRotatoryPower.dataTypeBaseUrl,
    definition: {
      title: "Molar Optical Rotatory Power",
      titlePlural: "Molar Optical Rotatory Powers",
      description:
        "Numeric values in convertible units of molar optical rotatory power.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.molarOpticalRotatoryPowerMetric.dataTypeBaseUrl,
    definition: {
      title: "Molar Optical Rotatory Power (Metric)",
      titlePlural: "Molar Optical Rotatory Powers (Metric)",
      description:
        "Molar Optical Rotatory Power expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.molarOpticalRotatoryPower.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.radianSquareMetersPerMole.dataTypeBaseUrl,
    definition: {
      title: "Radian Square Meter per Mole",
      titlePlural: "Radian Square Meters per Mole",
      description: "A value expressed in radian square meters per mole.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.molarOpticalRotatoryPowerMetric.dataTypeId,
        },
      ],
      label: {
        right: "rad·m²/mol",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.specificOpticalRotatoryPower.dataTypeBaseUrl,
    definition: {
      title: "Specific Optical Rotatory Power",
      titlePlural: "Specific Optical Rotatory Powers",
      description:
        "Numeric values in convertible units of specific optical rotatory power.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.specificOpticalRotatoryPowerMetric.dataTypeBaseUrl,
    definition: {
      title: "Specific Optical Rotatory Power (Metric)",
      titlePlural: "Specific Optical Rotatory Powers (Metric)",
      description:
        "Specific Optical Rotatory Power expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.specificOpticalRotatoryPower.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.radianSquareMetersPerKilogram.dataTypeBaseUrl,
    definition: {
      title: "Radian Square Meter per Kilogram",
      titlePlural: "Radian Square Meters per Kilogram",
      description: "A value expressed in radian square meters per kilogram.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.specificOpticalRotatoryPowerMetric.dataTypeId,
        },
      ],
      label: {
        right: "rad·m²/kg",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.gyromagneticRatio.dataTypeBaseUrl,
    definition: {
      title: "Gyromagnetic Ratio",
      titlePlural: "Gyromagnetic Ratios",
      description: "Numeric values in convertible units of gyromagnetic ratio.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.gyromagneticRatioMetric.dataTypeBaseUrl,
    definition: {
      title: "Gyromagnetic Ratio (Metric)",
      titlePlural: "Gyromagnetic Ratios (Metric)",
      description:
        "Gyromagnetic Ratio expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.gyromagneticRatio.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.ampereSquareMetersPerJouleSecond.dataTypeBaseUrl,
    definition: {
      title: "Ampere Square Meter per Joule Second",
      titlePlural: "Ampere Square Meters per Joule Second",
      description:
        "A value expressed in ampere square meters per joule second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.gyromagneticRatioMetric.dataTypeId,
        },
      ],
      label: {
        right: "A·m²·J⁻¹·s⁻¹",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.activityPerMass.dataTypeBaseUrl,
    definition: {
      title: "Activity per Mass",
      titlePlural: "Activities per Mass",
      description: "Numeric values in convertible units of activity per mass.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.activityPerMassMetric.dataTypeBaseUrl,
    definition: {
      title: "Activity per Mass (Metric)",
      titlePlural: "Activities per Mass (Metric)",
      description:
        "Activity per Mass expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.activityPerMass.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.becquerelsPerKilogram.dataTypeBaseUrl,
    definition: {
      title: "Becquerel per Kilogram",
      titlePlural: "Becquerels per Kilogram",
      description: "A value expressed in becquerels per kilogram.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.activityPerMassMetric.dataTypeId,
        },
      ],
      label: {
        right: "Bq/kg",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.activityPerVolume.dataTypeBaseUrl,
    definition: {
      title: "Activity per Volume",
      titlePlural: "Activities per Volume",
      description:
        "Numeric values in convertible units of activity per volume.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.activityPerVolumeMetric.dataTypeBaseUrl,
    definition: {
      title: "Activity per Volume (Metric)",
      titlePlural: "Activities per Volume (Metric)",
      description:
        "Activity per Volume expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.activityPerVolume.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.becquerelsPerCubicMeter.dataTypeBaseUrl,
    definition: {
      title: "Becquerel per Cubic Meter",
      titlePlural: "Becquerels per Cubic Meter",
      description: "A value expressed in becquerels per cubic meter.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.activityPerVolumeMetric.dataTypeId,
        },
      ],
      label: {
        right: "Bq/m³",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.activityPerArea.dataTypeBaseUrl,
    definition: {
      title: "Activity per Area",
      titlePlural: "Activities per Area",
      description: "Numeric values in convertible units of activity per area.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.activityPerAreaMetric.dataTypeBaseUrl,
    definition: {
      title: "Activity per Area (Metric)",
      titlePlural: "Activities per Area (Metric)",
      description:
        "Activity per Area expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.activityPerArea.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.becquerelsPerSquareMeter.dataTypeBaseUrl,
    definition: {
      title: "Becquerel per Square Meter",
      titlePlural: "Becquerels per Square Meter",
      description: "A value expressed in becquerels per square meter.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.activityPerAreaMetric.dataTypeId,
        },
      ],
      label: {
        right: "Bq/m²",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.crossSectionPerSolidAngle.dataTypeBaseUrl,
    definition: {
      title: "Cross Section per Solid Angle",
      titlePlural: "Cross Sections per Solid Angle",
      description:
        "Numeric values in convertible units of cross section per solid angle.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.crossSectionPerSolidAngleMetric.dataTypeBaseUrl,
    definition: {
      title: "Cross Section per Solid Angle (Metric)",
      titlePlural: "Cross Sections per Solid Angle (Metric)",
      description:
        "Cross Section per Solid Angle expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.crossSectionPerSolidAngle.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.squareMetersPerSteradian.dataTypeBaseUrl,
    definition: {
      title: "Square Meter per Steradian",
      titlePlural: "Square Meters per Steradian",
      description: "A value expressed in square meters per steradian.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.crossSectionPerSolidAngleMetric.dataTypeId,
        },
      ],
      label: {
        right: "m²·sr⁻¹",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.crossSectionPerEnergy.dataTypeBaseUrl,
    definition: {
      title: "Cross Section per Energy",
      titlePlural: "Cross Sections per Energy",
      description:
        "Numeric values in convertible units of cross section per energy.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.crossSectionPerEnergyMetric.dataTypeBaseUrl,
    definition: {
      title: "Cross Section per Energy (Metric)",
      titlePlural: "Cross Sections per Energy (Metric)",
      description:
        "Cross Section per Energy expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.crossSectionPerEnergy.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.squareMetersPerJoule.dataTypeBaseUrl,
    definition: {
      title: "Square Meter per Joule",
      titlePlural: "Square Meters per Joule",
      description: "A value expressed in square meters per joule.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.crossSectionPerEnergyMetric.dataTypeId,
        },
      ],
      label: {
        right: "m²/J",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.crossSectionPerEnergyAndSolidAngle.dataTypeBaseUrl,
    definition: {
      title: "Cross Section per Energy and Solid Angle",
      titlePlural: "Cross Sections per Energy and Solid Angle",
      description:
        "Numeric values in convertible units of cross section per energy and solid angle.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.crossSectionPerEnergyAndSolidAngleMetric.dataTypeBaseUrl,
    definition: {
      title: "Cross Section per Energy and Solid Angle (Metric)",
      titlePlural: "Cross Sections per Energy and Solid Angle (Metric)",
      description:
        "Cross Section per Energy and Solid Angle expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.crossSectionPerEnergyAndSolidAngle.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.squareMetersPerJouleSteradian.dataTypeBaseUrl,
    definition: {
      title: "Square Meter per Joule Steradian",
      titlePlural: "Square Meters per Joule Steradian",
      description: "A value expressed in square meters per joule steradian.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.crossSectionPerEnergyAndSolidAngleMetric
            .dataTypeId,
        },
      ],
      label: {
        right: "m²/(J·sr)",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.mobility.dataTypeBaseUrl,
    definition: {
      title: "Mobility",
      titlePlural: "Mobilities",
      description: "Numeric values in convertible units of mobility.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.mobilityMetric.dataTypeBaseUrl,
    definition: {
      title: "Mobility (Metric)",
      titlePlural: "Mobilities (Metric)",
      description: "Mobility expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.mobility.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.squareMetersPerVoltSecond.dataTypeBaseUrl,
    definition: {
      title: "Square Meter per Volt Second",
      titlePlural: "Square Meters per Volt Second",
      description: "A value expressed in square meters per volt second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.mobilityMetric.dataTypeId,
        },
      ],
      label: {
        right: "m²/(V·s)",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.particleProductionDensity.dataTypeBaseUrl,
    definition: {
      title: "Particle Production Density",
      titlePlural: "Particle Production Densities",
      description:
        "Numeric values in convertible units of particle production density.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.particleProductionDensityMetric.dataTypeBaseUrl,
    definition: {
      title: "Particle Production Density (Metric)",
      titlePlural: "Particle Production Densities (Metric)",
      description:
        "Particle Production Density expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.particleProductionDensity.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.reciprocalCubicMeterSeconds.dataTypeBaseUrl,
    definition: {
      title: "Reciprocal Cubic Meter Second",
      titlePlural: "Reciprocal Cubic Meter Seconds",
      description: "A value expressed in reciprocal cubic meter seconds.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.particleProductionDensityMetric.dataTypeId,
        },
      ],
      label: {
        right: "m⁻³·s⁻¹",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.doseEquivalentRate.dataTypeBaseUrl,
    definition: {
      title: "Dose Equivalent Rate",
      titlePlural: "Dose Equivalent Rates",
      description:
        "Numeric values in convertible units of dose equivalent rate.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.doseEquivalentRateMetric.dataTypeBaseUrl,
    definition: {
      title: "Dose Equivalent Rate (Metric)",
      titlePlural: "Dose Equivalent Rates (Metric)",
      description:
        "Dose Equivalent Rate expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.doseEquivalentRate.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.sievertsPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Sievert per Second",
      titlePlural: "Sieverts per Second",
      description: "A value expressed in sieverts per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.doseEquivalentRateMetric.dataTypeId,
        },
      ],
      label: {
        right: "Sv/s",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.exposureRate.dataTypeBaseUrl,
    definition: {
      title: "Exposure Rate",
      titlePlural: "Exposure Rates",
      description: "Numeric values in convertible units of exposure rate.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.exposureRateMetric.dataTypeBaseUrl,
    definition: {
      title: "Exposure Rate (Metric)",
      titlePlural: "Exposure Rates (Metric)",
      description: "Exposure Rate expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.exposureRate.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.coulombsPerKilogramSecond.dataTypeBaseUrl,
    definition: {
      title: "Coulomb per Kilogram Second",
      titlePlural: "Coulombs per Kilogram Second",
      description: "A value expressed in coulombs per kilogram second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.exposureRateMetric.dataTypeId,
        },
      ],
      label: {
        right: "C/(kg·s)",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.angularWavenumber.dataTypeBaseUrl,
    definition: {
      title: "Angular Wavenumber",
      titlePlural: "Angular Wavenumbers",
      description: "Numeric values in convertible units of angular wavenumber.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.angularWavenumberMetric.dataTypeBaseUrl,
    definition: {
      title: "Angular Wavenumber (Metric)",
      titlePlural: "Angular Wavenumbers (Metric)",
      description:
        "Angular Wavenumber expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.angularWavenumber.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.radiansPerMeter.dataTypeBaseUrl,
    definition: {
      title: "Radian per Meter",
      titlePlural: "Radians per Meter",
      description: "A value expressed in radians per meter.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.angularWavenumberMetric.dataTypeId,
        },
      ],
      label: {
        right: "rad/m",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.vibrationalDensityOfStates.dataTypeBaseUrl,
    definition: {
      title: "Vibrational Density of States",
      titlePlural: "Vibrational Densities of States",
      description:
        "Numeric values in convertible units of vibrational density of states.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.vibrationalDensityOfStatesMetric.dataTypeBaseUrl,
    definition: {
      title: "Vibrational Density of States (Metric)",
      titlePlural: "Vibrational Densities of States (Metric)",
      description:
        "Vibrational Density of States expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.vibrationalDensityOfStates.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.secondsPerCubicMeter.dataTypeBaseUrl,
    definition: {
      title: "Second per Cubic Meter",
      titlePlural: "Seconds per Cubic Meter",
      description: "A value expressed in seconds per cubic meter.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.vibrationalDensityOfStatesMetric.dataTypeId,
        },
      ],
      label: {
        right: "m⁻³·s",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.energyDensityOfStates.dataTypeBaseUrl,
    definition: {
      title: "Energy Density of States",
      titlePlural: "Energy Densities of States",
      description:
        "Numeric values in convertible units of energy density of states.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.energyDensityOfStatesMetric.dataTypeBaseUrl,
    definition: {
      title: "Energy Density of States (Metric)",
      titlePlural: "Energy Densities of States (Metric)",
      description:
        "Energy Density of States expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.energyDensityOfStates.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.reciprocalJouleCubicMeters.dataTypeBaseUrl,
    definition: {
      title: "Reciprocal Joule Cubic Meter",
      titlePlural: "Reciprocal Joule Cubic Meters",
      description: "A value expressed in reciprocal joule cubic meters.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.energyDensityOfStatesMetric.dataTypeId,
        },
      ],
      label: {
        right: "J⁻¹·m⁻³",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.lorenzCoefficient.dataTypeBaseUrl,
    definition: {
      title: "Lorenz Coefficient",
      titlePlural: "Lorenz Coefficients",
      description: "Numeric values in convertible units of lorenz coefficient.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.lorenzCoefficientMetric.dataTypeBaseUrl,
    definition: {
      title: "Lorenz Coefficient (Metric)",
      titlePlural: "Lorenz Coefficients (Metric)",
      description:
        "Lorenz Coefficient expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.lorenzCoefficient.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.squareVoltsPerSquareKelvin.dataTypeBaseUrl,
    definition: {
      title: "Square Volt per Square Kelvin",
      titlePlural: "Square Volts per Square Kelvin",
      description: "A value expressed in square volts per square kelvin.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.lorenzCoefficientMetric.dataTypeId,
        },
      ],
      label: {
        right: "V²/K²",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.hallCoefficient.dataTypeBaseUrl,
    definition: {
      title: "Hall Coefficient",
      titlePlural: "Hall Coefficients",
      description: "Numeric values in convertible units of hall coefficient.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.hallCoefficientMetric.dataTypeBaseUrl,
    definition: {
      title: "Hall Coefficient (Metric)",
      titlePlural: "Hall Coefficients (Metric)",
      description:
        "Hall Coefficient expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.hallCoefficient.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.cubicMetersPerCoulomb.dataTypeBaseUrl,
    definition: {
      title: "Cubic Meter per Coulomb",
      titlePlural: "Cubic Meters per Coulomb",
      description: "A value expressed in cubic meters per coulomb.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.hallCoefficientMetric.dataTypeId,
        },
      ],
      label: {
        right: "m³/C",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.thermoelectricCoefficient.dataTypeBaseUrl,
    definition: {
      title: "Thermoelectric Coefficient",
      titlePlural: "Thermoelectric Coefficients",
      description:
        "Numeric values in convertible units of thermoelectric coefficient.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.thermoelectricCoefficientMetric.dataTypeBaseUrl,
    definition: {
      title: "Thermoelectric Coefficient (Metric)",
      titlePlural: "Thermoelectric Coefficients (Metric)",
      description:
        "Thermoelectric Coefficient expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.thermoelectricCoefficient.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.voltsPerKelvin.dataTypeBaseUrl,
    definition: {
      title: "Volt per Kelvin",
      titlePlural: "Volts per Kelvin",
      description: "A value expressed in volts per kelvin.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.thermoelectricCoefficientMetric.dataTypeId,
        },
      ],
      label: {
        right: "V/K",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.richardsonConstant.dataTypeBaseUrl,
    definition: {
      title: "Richardson Constant",
      titlePlural: "Richardson Constants",
      description:
        "Numeric values in convertible units of richardson constant.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.richardsonConstantMetric.dataTypeBaseUrl,
    definition: {
      title: "Richardson Constant (Metric)",
      titlePlural: "Richardson Constants (Metric)",
      description:
        "Richardson Constant expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.richardsonConstant.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.amperesPerSquareMeterSquareKelvin.dataTypeBaseUrl,
    definition: {
      title: "Ampere per Square Meter Square Kelvin",
      titlePlural: "Amperes per Square Meter Square Kelvin",
      description:
        "A value expressed in amperes per square meter square kelvin.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.richardsonConstantMetric.dataTypeId,
        },
      ],
      label: {
        right: "A·m⁻²·K⁻²",
      },
    },
    conversions: {},
  },
];

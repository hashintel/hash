import { systemDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { IsoDataType } from "../data-types";

export const compoundUnitsDataTypes: IsoDataType[] = [
  {
    definition: {
      title: "Linear Mass Density",
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
    definition: {
      title: "Linear Mass Density (Metric)",
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
    definition: {
      title: "Kilograms per Meter",
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
    definition: {
      title: "Moment of Inertia",
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
    definition: {
      title: "Moment of Inertia (Metric)",
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
    definition: {
      title: "Kilogram Square Meters",
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
    definition: {
      title: "Momentum",
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
    definition: {
      title: "Momentum (Metric)",
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
    definition: {
      title: "Kilogram Meters per Second",
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
    definition: {
      title: "Impulse",
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
    definition: {
      title: "Impulse (Metric)",
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
    definition: {
      title: "Newton Seconds",
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
    definition: {
      title: "Angular Momentum",
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
    definition: {
      title: "Angular Momentum (Metric)",
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
    definition: {
      title: "Kilogram Square Meters per Second",
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
    definition: {
      title: "Angular Impulse",
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
    definition: {
      title: "Angular Impulse (Metric)",
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
    definition: {
      title: "Newton Meter Seconds",
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
    definition: {
      title: "Action",
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
    definition: {
      title: "Action (Metric)",
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
    definition: {
      title: "Joule Seconds",
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
    definition: {
      title: "Reciprocal Pressure",
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
    definition: {
      title: "Reciprocal Pressure (Metric)",
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
    definition: {
      title: "Reciprocal Pascals",
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
    definition: {
      title: "Fourth Power of Length",
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
    definition: {
      title: "Fourth Power of Length (Metric)",
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
    definition: {
      title: "Meters to the Fourth Power",
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
    definition: {
      title: "Mass Flux Density",
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
    definition: {
      title: "Mass Flux Density (Metric)",
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
    definition: {
      title: "Kilograms per Square Meter Second",
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
    definition: {
      title: "Mass Flow Rate",
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
    definition: {
      title: "Mass Flow Rate (Metric)",
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
    definition: {
      title: "Kilograms per Second",
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
    definition: {
      title: "Reciprocal Temperature Interval",
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
    definition: {
      title: "Reciprocal Temperature Interval (Metric)",
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
    definition: {
      title: "Reciprocal Kelvins",
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
    definition: {
      title: "Pressure per Temperature Interval",
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
    definition: {
      title: "Pressure per Temperature Interval (Metric)",
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
    definition: {
      title: "Pascals per Kelvin",
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
    definition: {
      title: "Heat Transfer Coefficient",
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
    definition: {
      title: "Heat Transfer Coefficient (Metric)",
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
    definition: {
      title: "Watts per Square Meter Kelvin",
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
    definition: {
      title: "Thermal Insulance",
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
    definition: {
      title: "Thermal Insulance (Metric)",
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
    definition: {
      title: "Square Meter Kelvins per Watt",
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
    definition: {
      title: "Thermal Resistance",
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
    definition: {
      title: "Thermal Resistance (Metric)",
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
    definition: {
      title: "Kelvins per Watt",
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
    definition: {
      title: "Thermal Conductance",
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
    definition: {
      title: "Thermal Conductance (Metric)",
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
    definition: {
      title: "Watts per Kelvin",
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
    definition: {
      title: "Temperature Interval per Pressure",
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
    definition: {
      title: "Temperature Interval per Pressure (Metric)",
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
    definition: {
      title: "Kelvins per Pascal",
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
    definition: {
      title: "Linear Charge Density",
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
    definition: {
      title: "Linear Charge Density (Metric)",
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
    definition: {
      title: "Coulombs per Meter",
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
    definition: {
      title: "Electric Dipole Moment",
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
    definition: {
      title: "Electric Dipole Moment (Metric)",
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
    definition: {
      title: "Coulomb Meters",
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
    definition: {
      title: "Magnetic Moment",
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
    definition: {
      title: "Magnetic Moment (Metric)",
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
    definition: {
      title: "Ampere Square Meters",
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
    definition: {
      title: "Magnetic Dipole Moment",
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
    definition: {
      title: "Magnetic Dipole Moment (Metric)",
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
    definition: {
      title: "Weber Meters",
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
    definition: {
      title: "Magnetic Vector Potential",
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
    definition: {
      title: "Magnetic Vector Potential (Metric)",
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
    definition: {
      title: "Webers per Meter",
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
    definition: {
      title: "Magnetic Reluctance",
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
    definition: {
      title: "Magnetic Reluctance (Metric)",
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
    definition: {
      title: "Reciprocal Henries",
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
    definition: {
      title: "Electric Conductivity",
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
    definition: {
      title: "Electric Conductivity (Metric)",
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
    definition: {
      title: "Siemens per Meter",
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
    definition: {
      title: "Electric Resistivity",
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
    definition: {
      title: "Electric Resistivity (Metric)",
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
    definition: {
      title: "Ohm Meters",
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
    definition: {
      title: "Apparent Power",
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
    definition: {
      title: "Apparent Power (Metric)",
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
    definition: {
      title: "Volt Amperes",
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
    definition: {
      title: "Reactive Power",
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
    definition: {
      title: "Reactive Power (Metric)",
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
    definition: {
      title: "Vars",
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
    definition: {
      title: "Energy per Area",
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
    definition: {
      title: "Energy per Area (Metric)",
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
    definition: {
      title: "Joules per Square Meter",
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
    definition: {
      title: "Luminous Efficacy",
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
    definition: {
      title: "Luminous Efficacy (Metric)",
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
    definition: {
      title: "Lumens per Watt",
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
    definition: {
      title: "Luminous Energy",
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
    definition: {
      title: "Luminous Energy (Metric)",
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
    definition: {
      title: "Lumen Seconds",
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
    definition: {
      title: "Luminous Exposure",
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
    definition: {
      title: "Luminous Exposure (Metric)",
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
    definition: {
      title: "Lux Seconds",
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
    definition: {
      title: "Reciprocal Duration",
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
    definition: {
      title: "Reciprocal Duration (Metric)",
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
    definition: {
      title: "Reciprocal Seconds",
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
    definition: {
      title: "Particle Intensity",
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
    definition: {
      title: "Particle Intensity (Metric)",
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
    definition: {
      title: "Reciprocal Second Steradians",
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
    definition: {
      title: "Particle Radiance",
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
    definition: {
      title: "Particle Radiance (Metric)",
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
    definition: {
      title: "Reciprocal Square Meter Second Steradians",
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
    definition: {
      title: "Particle Flux Density",
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
    definition: {
      title: "Particle Flux Density (Metric)",
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
    definition: {
      title: "Reciprocal Square Meter Seconds",
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
    definition: {
      title: "Number per Area",
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
    definition: {
      title: "Number per Area (Metric)",
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
    definition: {
      title: "Reciprocal Square Meters",
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
    definition: {
      title: "Area per Mass",
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
    definition: {
      title: "Area per Mass (Metric)",
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
    definition: {
      title: "Square Meters per Kilogram",
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
    definition: {
      title: "Area per Amount",
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
    definition: {
      title: "Area per Amount (Metric)",
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
    definition: {
      title: "Square Meters per Mole",
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
    definition: {
      title: "Sound Exposure",
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
    definition: {
      title: "Sound Exposure (Metric)",
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
    definition: {
      title: "Pascal Squared Seconds",
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
    definition: {
      title: "Specific Acoustic Impedance",
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
    definition: {
      title: "Specific Acoustic Impedance (Metric)",
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
    definition: {
      title: "Pascal Seconds per Meter",
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
    definition: {
      title: "Acoustic Impedance",
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
    definition: {
      title: "Acoustic Impedance (Metric)",
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
    definition: {
      title: "Pascal Seconds per Cubic Meter",
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
    definition: {
      title: "Molar Mass",
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
    definition: {
      title: "Molar Mass (Metric)",
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
    definition: {
      title: "Kilograms per Mole",
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
    definition: {
      title: "Molar Volume",
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
    definition: {
      title: "Molar Volume (Metric)",
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
    definition: {
      title: "Cubic Meters per Mole",
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
    definition: {
      title: "Number per Volume",
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
    definition: {
      title: "Number per Volume (Metric)",
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
    definition: {
      title: "Reciprocal Cubic Meters",
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
    definition: {
      title: "Molality",
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
    definition: {
      title: "Molality (Metric)",
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
    definition: {
      title: "Moles per Kilogram",
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
    definition: {
      title: "Molar Conductivity",
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
    definition: {
      title: "Molar Conductivity (Metric)",
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
    definition: {
      title: "Siemens Square Meters per Mole",
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
    definition: {
      title: "Molar Optical Rotatory Power",
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
    definition: {
      title: "Molar Optical Rotatory Power (Metric)",
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
    definition: {
      title: "Radian Square Meters per Mole",
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
    definition: {
      title: "Specific Optical Rotatory Power",
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
    definition: {
      title: "Specific Optical Rotatory Power (Metric)",
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
    definition: {
      title: "Radian Square Meters per Kilogram",
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
    definition: {
      title: "Gyromagnetic Ratio",
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
    definition: {
      title: "Gyromagnetic Ratio (Metric)",
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
    definition: {
      title: "Ampere Square Meters per Joule Second",
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
    definition: {
      title: "Activity per Mass",
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
    definition: {
      title: "Activity per Mass (Metric)",
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
    definition: {
      title: "Becquerels per Kilogram",
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
    definition: {
      title: "Activity per Volume",
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
    definition: {
      title: "Activity per Volume (Metric)",
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
    definition: {
      title: "Becquerels per Cubic Meter",
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
    definition: {
      title: "Activity per Area",
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
    definition: {
      title: "Activity per Area (Metric)",
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
    definition: {
      title: "Becquerels per Square Meter",
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
    definition: {
      title: "Cross Section per Solid Angle",
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
    definition: {
      title: "Cross Section per Solid Angle (Metric)",
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
    definition: {
      title: "Square Meters per Steradian",
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
    definition: {
      title: "Cross Section per Energy",
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
    definition: {
      title: "Cross Section per Energy (Metric)",
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
    definition: {
      title: "Square Meters per Joule",
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
    definition: {
      title: "Cross Section per Energy and Solid Angle",
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
    definition: {
      title: "Cross Section per Energy and Solid Angle (Metric)",
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
    definition: {
      title: "Square Meters per Joule Steradian",
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
    definition: {
      title: "Mobility",
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
    definition: {
      title: "Mobility (Metric)",
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
    definition: {
      title: "Square Meters per Volt Second",
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
    definition: {
      title: "Particle Production Density",
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
    definition: {
      title: "Particle Production Density (Metric)",
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
    definition: {
      title: "Reciprocal Cubic Meter Seconds",
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
    definition: {
      title: "Dose Equivalent Rate",
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
    definition: {
      title: "Dose Equivalent Rate (Metric)",
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
    definition: {
      title: "Sieverts per Second",
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
    definition: {
      title: "Exposure Rate",
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
    definition: {
      title: "Exposure Rate (Metric)",
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
    definition: {
      title: "Coulombs per Kilogram Second",
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
    definition: {
      title: "Angular Wavenumber",
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
    definition: {
      title: "Angular Wavenumber (Metric)",
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
    definition: {
      title: "Radians per Meter",
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
    definition: {
      title: "Vibrational Density of States",
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
    definition: {
      title: "Vibrational Density of States (Metric)",
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
    definition: {
      title: "Seconds per Cubic Meter",
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
    definition: {
      title: "Energy Density of States",
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
    definition: {
      title: "Energy Density of States (Metric)",
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
    definition: {
      title: "Reciprocal Joule Cubic Meters",
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
    definition: {
      title: "Lorenz Coefficient",
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
    definition: {
      title: "Lorenz Coefficient (Metric)",
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
    definition: {
      title: "Square Volts per Square Kelvin",
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
    definition: {
      title: "Hall Coefficient",
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
    definition: {
      title: "Hall Coefficient (Metric)",
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
    definition: {
      title: "Cubic Meters per Coulomb",
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
    definition: {
      title: "Thermoelectric Coefficient",
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
    definition: {
      title: "Thermoelectric Coefficient (Metric)",
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
    definition: {
      title: "Volts per Kelvin",
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
    definition: {
      title: "Richardson Constant",
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
    definition: {
      title: "Richardson Constant (Metric)",
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
    definition: {
      title: "Amperes per Square Meter Square Kelvin",
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

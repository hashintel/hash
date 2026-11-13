import { systemDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { IsoPropertyType } from "../property-types";

export const part5PropertyTypes: IsoPropertyType[] = [
  {
    definition: {
      title: "Thermodynamic Temperature",
      description:
        "An absolute temperature reading, distinct from a temperature difference.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.temperature.dataTypeId,
        },
      ],
    },
    isoItems: ["5-1"],
  },
  {
    definition: {
      title: "Celsius Temperature",
      description:
        "A temperature reading on the Celsius scale, distinct from a temperature difference.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.temperature.dataTypeId,
        },
      ],
    },
    isoItems: ["5-2"],
  },
  {
    definition: {
      title: "Linear Expansion Coefficient",
      description:
        "The linear expansion coefficient of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.reciprocalTemperatureInterval.dataTypeId,
        },
      ],
    },
    isoItems: ["5-3.1"],
  },
  {
    definition: {
      title: "Cubic Expansion Coefficient",
      description:
        "The cubic expansion coefficient of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.reciprocalTemperatureInterval.dataTypeId,
        },
      ],
    },
    isoItems: ["5-3.2"],
  },
  {
    definition: {
      title: "Relative Pressure Coefficient",
      description:
        "The relative pressure coefficient of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.reciprocalTemperatureInterval.dataTypeId,
        },
      ],
    },
    isoItems: ["5-3.3"],
  },
  {
    definition: {
      title: "Pressure Coefficient",
      description:
        "The pressure coefficient of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.pressurePerTemperatureInterval.dataTypeId,
        },
      ],
    },
    isoItems: ["5-4"],
  },
  {
    definition: {
      title: "Isothermal Compressibility",
      description:
        "The isothermal compressibility of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.reciprocalPressure.dataTypeId,
        },
      ],
    },
    isoItems: ["5-5.1"],
  },
  {
    definition: {
      title: "Isentropic Compressibility",
      description:
        "The isentropic compressibility of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.reciprocalPressure.dataTypeId,
        },
      ],
    },
    isoItems: ["5-5.2"],
  },
  {
    definition: {
      title: "Heat",
      description:
        "The heat of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["5-6.1"],
  },
  {
    definition: {
      title: "Latent Heat",
      description:
        "The latent heat of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["5-6.2", "9-16"],
  },
  {
    definition: {
      title: "Heat Flow Rate",
      description:
        "The heat flow rate of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.power.dataTypeId,
        },
      ],
    },
    isoItems: ["5-7"],
  },
  {
    definition: {
      title: "Heat Flux Density",
      description:
        "The density of heat flow rate of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.heatFluxDensity.dataTypeId,
        },
      ],
    },
    isoItems: ["5-8"],
  },
  {
    definition: {
      title: "Thermal Conductivity",
      description:
        "The proportionality between heat flux density and negative temperature gradient.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.thermalConductivity.dataTypeId,
        },
      ],
    },
    isoItems: ["5-9"],
  },
  {
    definition: {
      title: "Coefficient of Heat Transfer",
      description:
        "The coefficient of heat transfer of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.heatTransferCoefficient.dataTypeId,
        },
      ],
    },
    isoItems: ["5-10.1"],
  },
  {
    definition: {
      title: "Surface Coefficient of Heat Transfer",
      description:
        "The surface coefficient of heat transfer of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.heatTransferCoefficient.dataTypeId,
        },
      ],
    },
    isoItems: ["5-10.2"],
  },
  {
    definition: {
      title: "Thermal Insulance",
      description:
        "The thermal insulance of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.thermalInsulance.dataTypeId,
        },
      ],
    },
    isoItems: ["5-11"],
  },
  {
    definition: {
      title: "Thermal Resistance",
      description:
        "The thermal resistance of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.thermalResistance.dataTypeId,
        },
      ],
    },
    isoItems: ["5-12"],
  },
  {
    definition: {
      title: "Thermal Conductance",
      description:
        "The thermal conductance of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.thermalConductance.dataTypeId,
        },
      ],
    },
    isoItems: ["5-13"],
  },
  {
    definition: {
      title: "Thermal Diffusivity",
      description: "Thermal conductivity divided by volumetric heat capacity.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.kinematicViscosity.dataTypeId,
        },
      ],
    },
    isoItems: ["5-14"],
  },
  {
    definition: {
      title: "Heat Capacity",
      description:
        "The heat transfer required per unit increase in temperature under stated conditions.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.heatCapacity.dataTypeId,
        },
      ],
    },
    isoItems: ["5-15"],
  },
  {
    definition: {
      title: "Specific Heat Capacity",
      description: "Heat capacity divided by mass under stated conditions.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.specificHeatCapacity.dataTypeId,
        },
      ],
    },
    isoItems: ["5-16.1"],
  },
  {
    definition: {
      title: "Specific Heat Capacity at Constant Pressure",
      description:
        "The specific heat capacity at constant pressure of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.specificHeatCapacity.dataTypeId,
        },
      ],
    },
    isoItems: ["5-16.2"],
  },
  {
    definition: {
      title: "Specific Heat Capacity at Constant Volume",
      description:
        "The specific heat capacity at constant volume of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.specificHeatCapacity.dataTypeId,
        },
      ],
    },
    isoItems: ["5-16.3"],
  },
  {
    definition: {
      title: "Specific Heat Capacity at Saturated Vapour Pressure",
      description:
        "The specific heat capacity at saturated vapour pressure of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.specificHeatCapacity.dataTypeId,
        },
      ],
    },
    isoItems: ["5-16.4"],
  },
  {
    definition: {
      title: "Ratio of Specific Heat Capacities",
      description:
        "The ratio of specific heat capacities of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["5-17.1"],
  },
  {
    definition: {
      title: "Isentropic Exponent",
      description:
        "The isentropic exponent of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["5-17.2"],
  },
  {
    definition: {
      title: "Thermodynamic Entropy",
      description:
        "The thermodynamic state quantity whose reversible change is heat transfer divided by absolute temperature.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.heatCapacity.dataTypeId,
        },
      ],
    },
    isoItems: ["5-18"],
  },
  {
    definition: {
      title: "Specific Entropy",
      description: "Thermodynamic entropy divided by mass.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.specificHeatCapacity.dataTypeId,
        },
      ],
    },
    isoItems: ["5-19"],
  },
  {
    definition: {
      title: "Energy",
      description:
        "The energy of an object or system relative to the stated reference.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["5-20.1"],
  },
  {
    definition: {
      title: "Internal Energy",
      description:
        "The internal energy of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["5-20.2"],
  },
  {
    definition: {
      title: "Enthalpy",
      description:
        "The enthalpy of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["5-20.3"],
  },
  {
    definition: {
      title: "Helmholtz Energy",
      description:
        "The Helmholtz energy of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["5-20.4"],
  },
  {
    definition: {
      title: "Gibbs Energy",
      description:
        "The Gibbs energy of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["5-20.5"],
  },
  {
    definition: {
      title: "Specific Energy",
      description:
        "The specific energy of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.specificEnergy.dataTypeId,
        },
      ],
    },
    isoItems: ["5-21.1"],
  },
  {
    definition: {
      title: "Specific Internal Energy",
      description:
        "The specific internal energy of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.specificEnergy.dataTypeId,
        },
      ],
    },
    isoItems: ["5-21.2"],
  },
  {
    definition: {
      title: "Specific Enthalpy",
      description:
        "The specific enthalpy of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.specificEnergy.dataTypeId,
        },
      ],
    },
    isoItems: ["5-21.3"],
  },
  {
    definition: {
      title: "Specific Helmholtz Energy",
      description:
        "The specific Helmholtz energy of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.specificEnergy.dataTypeId,
        },
      ],
    },
    isoItems: ["5-21.4"],
  },
  {
    definition: {
      title: "Specific Gibbs Energy",
      description:
        "The specific Gibbs energy of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.specificEnergy.dataTypeId,
        },
      ],
    },
    isoItems: ["5-21.5"],
  },
  {
    definition: {
      title: "Massieu Function",
      description:
        "The Massieu function of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.heatCapacity.dataTypeId,
        },
      ],
    },
    isoItems: ["5-22"],
  },
  {
    definition: {
      title: "Planck Function",
      description:
        "The Planck function of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.heatCapacity.dataTypeId,
        },
      ],
    },
    isoItems: ["5-23"],
  },
  {
    definition: {
      title: "Joule-Thomson Coefficient",
      description:
        "The Joule-Thomson coefficient of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.temperatureIntervalPerPressure.dataTypeId,
        },
      ],
    },
    isoItems: ["5-24"],
  },
  {
    definition: {
      title: "Thermal Efficiency",
      description:
        "The efficiency of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
    },
    isoItems: ["5-25.1"],
  },
  {
    definition: {
      title: "Maximum Thermal Efficiency",
      description:
        "The maximum efficiency of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
    },
    isoItems: ["5-25.2"],
  },
  {
    definition: {
      title: "Specific Gas Constant",
      description:
        "The specific gas constant of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.specificHeatCapacity.dataTypeId,
        },
      ],
    },
    isoItems: ["5-26", "9-37.2"],
  },
  {
    definition: {
      title: "Mass Concentration of Water",
      description:
        "The mass concentration of water of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.massDensity.dataTypeId,
        },
      ],
    },
    isoItems: ["5-27"],
  },
  {
    definition: {
      title: "Mass Concentration of Water Vapour",
      description:
        "The mass concentration of water vapour of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.massDensity.dataTypeId,
        },
      ],
    },
    isoItems: ["5-28"],
  },
  {
    definition: {
      title: "Mass Ratio of Water to Dry Matter",
      description:
        "The mass ratio of water to dry matter of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["5-29"],
  },
  {
    definition: {
      title: "Mass Ratio of Water Vapour to Dry Gas",
      description:
        "The mass ratio of water vapour to dry gas of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["5-30"],
  },
  {
    definition: {
      title: "Mass Fraction of Water",
      description:
        "The mass fraction of water of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
    },
    isoItems: ["5-31"],
  },
  {
    definition: {
      title: "Mass Fraction of Dry Matter",
      description:
        "The mass fraction of dry matter of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
    },
    isoItems: ["5-32"],
  },
  {
    definition: {
      title: "Relative Humidity",
      description:
        "Water-vapor partial pressure divided by its saturation value at the stated temperature; supersaturation can exceed one.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["5-33"],
  },
  {
    definition: {
      title: "Relative Mass Concentration of Vapour",
      description:
        "The relative mass concentration of vapour of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["5-34"],
  },
  {
    definition: {
      title: "Relative Mass Ratio of Vapour",
      description:
        "The relative mass ratio of vapour of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["5-35"],
  },
  {
    definition: {
      title: "Dew-point Temperature",
      description:
        "The dew-point temperature of the specified system or process in thermodynamics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.temperature.dataTypeId,
        },
      ],
    },
    isoItems: ["5-36"],
  },
];

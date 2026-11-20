import {
  systemDataTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { IsoPropertyType } from "../property-types";

export const part9PropertyTypes: IsoPropertyType[] = [
  {
    definition: {
      title: "Number of Entities",
      description:
        "The number of entities of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.nonNegativeInteger.dataTypeId,
        },
      ],
    },
    isoItems: ["9-1"],
  },
  {
    definition: {
      title: "Amount of Substance",
      description:
        "The amount of substance of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.amountOfSubstance.dataTypeId,
        },
      ],
    },
    isoItems: ["9-2"],
  },
  {
    definition: {
      title: "Relative Atomic Mass",
      description:
        "The relative atomic mass of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["9-3"],
  },
  {
    definition: {
      title: "Molar Mass",
      description: "Mass divided by amount of substance.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.molarMass.dataTypeId,
        },
      ],
    },
    isoItems: ["9-4"],
  },
  {
    definition: {
      title: "Molar Volume",
      description:
        "The molar volume of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.molarVolume.dataTypeId,
        },
      ],
    },
    isoItems: ["9-5"],
  },
  {
    definition: {
      title: "Molar Internal Energy",
      description:
        "The molar internal energy of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.molarEnergy.dataTypeId,
        },
      ],
    },
    isoItems: ["9-6.1"],
  },
  {
    definition: {
      title: "Molar Enthalpy",
      description:
        "The molar enthalpy of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.molarEnergy.dataTypeId,
        },
      ],
    },
    isoItems: ["9-6.2"],
  },
  {
    definition: {
      title: "Molar Helmholtz Energy",
      description:
        "The molar Helmholtz energy of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.molarEnergy.dataTypeId,
        },
      ],
    },
    isoItems: ["9-6.3"],
  },
  {
    definition: {
      title: "Molar Gibbs Energy",
      description:
        "The molar Gibbs energy of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.molarEnergy.dataTypeId,
        },
      ],
    },
    isoItems: ["9-6.4"],
  },
  {
    definition: {
      title: "Molar Heat Capacity",
      description:
        "The molar heat capacity of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.molarHeatCapacity.dataTypeId,
        },
      ],
    },
    isoItems: ["9-7"],
  },
  {
    definition: {
      title: "Molar Entropy",
      description:
        "The molar entropy of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.molarHeatCapacity.dataTypeId,
        },
      ],
    },
    isoItems: ["9-8"],
  },
  {
    definition: {
      title: "Particle Concentration",
      description:
        "The particle concentration of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.numberPerVolume.dataTypeId,
        },
      ],
    },
    isoItems: ["9-9.1"],
  },
  {
    definition: {
      title: "Molecular Concentration",
      description:
        "The molecular concentration of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.numberPerVolume.dataTypeId,
        },
      ],
    },
    isoItems: ["9-9.2"],
  },
  {
    definition: {
      title: "Mass Concentration",
      description:
        "The mass of a constituent divided by the volume of the mixture.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.massDensity.dataTypeId,
        },
      ],
    },
    isoItems: ["9-10"],
  },
  {
    definition: {
      title: "Mass Fraction",
      description:
        "The mass of a constituent divided by the total mass of the mixture.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
    },
    isoItems: ["9-11"],
  },
  {
    definition: {
      title: "Amount-of-substance Concentration",
      description:
        "The amount of a constituent divided by the volume of the mixture.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.amountConcentration.dataTypeId,
        },
      ],
    },
    isoItems: ["9-12.1"],
  },
  {
    definition: {
      title: "Standard Amount-of-substance Concentration",
      description:
        "The standard amount-of-substance concentration of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.amountConcentration.dataTypeId,
        },
      ],
    },
    isoItems: ["9-12.2"],
  },
  {
    definition: {
      title: "Mole Fraction",
      description:
        "The amount of a constituent divided by the total amount of substance in the mixture.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
    },
    isoItems: ["9-13"],
  },
  {
    definition: {
      title: "Volume Fraction",
      description:
        "The constituent volume divided by the sum of constituent volumes, with temperature and pressure specified.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
    },
    isoItems: ["9-14"],
  },
  {
    definition: {
      title: "Molality",
      description: "The amount of solute divided by the mass of solvent.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.molality.dataTypeId,
        },
      ],
    },
    isoItems: ["9-15"],
  },
  {
    definition: {
      title: "Chemical Potential",
      description:
        "The change in Gibbs energy per change in the amount of a constituent at fixed temperature, pressure, and other constituent amounts.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.molarEnergy.dataTypeId,
        },
      ],
    },
    isoItems: ["9-17"],
  },
  {
    definition: {
      title: "Absolute Chemical Activity",
      description:
        "The absolute activity of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["9-18"],
  },
  {
    definition: {
      title: "Partial Pressure",
      description:
        "The partial pressure of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.pressure.dataTypeId,
        },
      ],
    },
    isoItems: ["9-19"],
  },
  {
    definition: {
      title: "Fugacity",
      description:
        "The fugacity of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.pressure.dataTypeId,
        },
      ],
    },
    isoItems: ["9-20"],
  },
  {
    definition: {
      title: "Standard Chemical Potential",
      description:
        "The standard chemical potential of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.molarEnergy.dataTypeId,
        },
      ],
    },
    isoItems: ["9-21"],
  },
  {
    definition: {
      title: "Activity Factor",
      description:
        "The activity factor of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["9-22"],
  },
  {
    definition: {
      title: "Standard Absolute Activity in a Mixture",
      description:
        "The standard absolute activity in a mixture of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["9-23"],
  },
  {
    definition: {
      title: "Activity of Solute",
      description:
        "The activity of solute of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["9-24"],
  },
  {
    definition: {
      title: "Activity Coefficient",
      description:
        "The activity coefficient of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["9-25"],
  },
  {
    definition: {
      title: "Standard Absolute Activity in a Solution",
      description:
        "The standard absolute activity in a solution of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["9-26"],
  },
  {
    definition: {
      title: "Activity of Solvent",
      description:
        "The activity of solvent of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["9-27.1"],
  },
  {
    definition: {
      title: "Osmotic Coefficient of Solvent",
      description:
        "The osmotic coefficient of solvent of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["9-27.2"],
  },
  {
    definition: {
      title: "Standard Absolute Activity of Solvent",
      description:
        "The standard absolute activity of solvent of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["9-27.3"],
  },
  {
    definition: {
      title: "Osmotic Pressure",
      description:
        "The osmotic pressure of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.pressure.dataTypeId,
        },
      ],
    },
    isoItems: ["9-28"],
  },
  {
    definition: {
      title: "Stoichiometric Number",
      description:
        "The stoichiometric number of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["9-29"],
  },
  {
    definition: {
      title: "Chemical Affinity",
      description:
        "The affinity of a chemical reaction of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.molarEnergy.dataTypeId,
        },
      ],
    },
    isoItems: ["9-30"],
  },
  {
    definition: {
      title: "Extent of Reaction",
      description:
        "The extent of reaction of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.amountOfSubstance.dataTypeId,
        },
      ],
    },
    isoItems: ["9-31"],
  },
  {
    definition: {
      title: "Standard Equilibrium Constant",
      description:
        "The dimensionless equilibrium constant expressed using activities relative to stated standard states.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["9-32"],
  },
  {
    definition: {
      title: "Microcanonical Partition Function",
      description:
        "The microcanonical partition function of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["9-35.1"],
  },
  {
    definition: {
      title: "Canonical Partition Function",
      description:
        "The canonical partition function of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["9-35.2"],
  },
  {
    definition: {
      title: "Grand-canonical Partition Function",
      description:
        "The grand-canonical partition function of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["9-35.3"],
  },
  {
    definition: {
      title: "Molecular Partition Function",
      description:
        "The molecular partition function of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["9-35.4"],
  },
  {
    definition: {
      title: "Statistical Weight of Subsystem",
      description:
        "The statistical weight of subsystem of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["9-36.1"],
  },
  {
    definition: {
      title: "Degeneracy",
      description:
        "The degeneracy of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.positiveInteger.dataTypeId,
        },
      ],
    },
    isoItems: ["9-36.2"],
  },
  {
    definition: {
      title: "Molar Gas Constant",
      description:
        "The molar gas constant of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.molarHeatCapacity.dataTypeId,
        },
      ],
    },
    isoItems: ["9-37.1"],
  },
  {
    definition: {
      title: "Mean Free Path",
      description:
        "The mean free path of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: ["9-38", "10-71"],
  },
  {
    definition: {
      title: "Diffusion Coefficient",
      description:
        "The diffusion coefficient of the specified system or process in physical chemistry and molecular physics. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.kinematicViscosity.dataTypeId,
        },
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xxComponentKinematicViscosity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xxComponentKinematicViscosity
                .propertyTypeId,
            },
            [systemPropertyTypes.xyComponentKinematicViscosity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xyComponentKinematicViscosity
                .propertyTypeId,
            },
            [systemPropertyTypes.xzComponentKinematicViscosity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xzComponentKinematicViscosity
                .propertyTypeId,
            },
            [systemPropertyTypes.yxComponentKinematicViscosity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yxComponentKinematicViscosity
                .propertyTypeId,
            },
            [systemPropertyTypes.yyComponentKinematicViscosity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yyComponentKinematicViscosity
                .propertyTypeId,
            },
            [systemPropertyTypes.yzComponentKinematicViscosity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yzComponentKinematicViscosity
                .propertyTypeId,
            },
            [systemPropertyTypes.zxComponentKinematicViscosity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zxComponentKinematicViscosity
                .propertyTypeId,
            },
            [systemPropertyTypes.zyComponentKinematicViscosity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zyComponentKinematicViscosity
                .propertyTypeId,
            },
            [systemPropertyTypes.zzComponentKinematicViscosity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zzComponentKinematicViscosity
                .propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xxComponentKinematicViscosity
              .propertyTypeBaseUrl,
            systemPropertyTypes.xyComponentKinematicViscosity
              .propertyTypeBaseUrl,
            systemPropertyTypes.xzComponentKinematicViscosity
              .propertyTypeBaseUrl,
            systemPropertyTypes.yxComponentKinematicViscosity
              .propertyTypeBaseUrl,
            systemPropertyTypes.yyComponentKinematicViscosity
              .propertyTypeBaseUrl,
            systemPropertyTypes.yzComponentKinematicViscosity
              .propertyTypeBaseUrl,
            systemPropertyTypes.zxComponentKinematicViscosity
              .propertyTypeBaseUrl,
            systemPropertyTypes.zyComponentKinematicViscosity
              .propertyTypeBaseUrl,
            systemPropertyTypes.zzComponentKinematicViscosity
              .propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["9-39", "10-64"],
  },
  {
    definition: {
      title: "Thermal Diffusion Ratio",
      description:
        "The thermal diffusion ratio of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["9-40.1"],
  },
  {
    definition: {
      title: "Thermal Diffusion Factor",
      description:
        "The thermal diffusion factor of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["9-40.2"],
  },
  {
    definition: {
      title: "Thermal Diffusion Coefficient",
      description:
        "The thermal diffusion coefficient of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.kinematicViscosity.dataTypeId,
        },
      ],
    },
    isoItems: ["9-41"],
  },
  {
    definition: {
      title: "Ionic Strength",
      description:
        "The ionic strength of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.molality.dataTypeId,
        },
      ],
    },
    isoItems: ["9-42"],
  },
  {
    definition: {
      title: "Degree of Dissociation",
      description:
        "The degree of dissociation of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
    },
    isoItems: ["9-43"],
  },
  {
    definition: {
      title: "Electrolytic Conductivity",
      description:
        "The electrolytic conductivity of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricConductivity.dataTypeId,
        },
      ],
    },
    isoItems: ["9-44"],
  },
  {
    definition: {
      title: "Molar Conductivity",
      description:
        "The molar conductivity of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.molarConductivity.dataTypeId,
        },
      ],
    },
    isoItems: ["9-45"],
  },
  {
    definition: {
      title: "Transport Number of the Ion",
      description:
        "The transport number of the ion of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["9-46"],
  },
  {
    definition: {
      title: "Angle of Optical Rotation",
      description:
        "The angle of optical rotation of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.angle.dataTypeId,
        },
      ],
    },
    isoItems: ["9-47"],
  },
  {
    definition: {
      title: "Molar Optical Rotatory Power",
      description:
        "The molar optical rotatory power of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.molarOpticalRotatoryPower.dataTypeId,
        },
      ],
    },
    isoItems: ["9-48"],
  },
  {
    definition: {
      title: "Specific Optical Rotatory Power",
      description:
        "The specific optical rotatory power of the specified system or process in physical chemistry and molecular physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.specificOpticalRotatoryPower.dataTypeId,
        },
      ],
    },
    isoItems: ["9-49"],
  },
];

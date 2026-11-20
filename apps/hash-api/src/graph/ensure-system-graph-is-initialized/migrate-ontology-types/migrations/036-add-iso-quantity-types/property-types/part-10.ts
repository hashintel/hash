import {
  systemDataTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { IsoPropertyType } from "../property-types";

export const part10PropertyTypes: IsoPropertyType[] = [
  {
    definition: {
      title: "Atomic Number",
      description:
        "The atomic number of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.nonNegativeInteger.dataTypeId,
        },
      ],
    },
    isoItems: ["10-1.1"],
  },
  {
    definition: {
      title: "Neutron Number",
      description:
        "The neutron number of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.nonNegativeInteger.dataTypeId,
        },
      ],
    },
    isoItems: ["10-1.2"],
  },
  {
    definition: {
      title: "Nucleon Number",
      description:
        "The nucleon number of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.nonNegativeInteger.dataTypeId,
        },
      ],
    },
    isoItems: ["10-1.3"],
  },
  {
    definition: {
      title: "Rest Mass",
      description:
        "The rest mass of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.mass.dataTypeId,
        },
      ],
    },
    isoItems: ["10-2"],
  },
  {
    definition: {
      title: "Rest Energy",
      description:
        "The rest energy of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["10-3"],
  },
  {
    definition: {
      title: "Atomic Mass",
      description:
        "The atomic mass of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.mass.dataTypeId,
        },
      ],
    },
    isoItems: ["10-4.1"],
  },
  {
    definition: {
      title: "Nuclidic Mass",
      description:
        "The nuclidic mass of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.mass.dataTypeId,
        },
      ],
    },
    isoItems: ["10-4.2"],
  },
  {
    definition: {
      title: "Unified Atomic Mass Constant",
      description:
        "The unified atomic mass constant of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.mass.dataTypeId,
        },
      ],
    },
    isoItems: ["10-4.3"],
  },
  {
    definition: {
      title: "Charge Number",
      description:
        "The charge number of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.integer.dataTypeId,
        },
      ],
    },
    isoItems: ["10-5.2"],
  },
  {
    definition: {
      title: "Bohr Radius",
      description:
        "The Bohr radius of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: ["10-6"],
  },
  {
    definition: {
      title: "Rydberg Constant",
      description:
        "The Rydberg constant of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.wavenumber.dataTypeId,
        },
      ],
    },
    isoItems: ["10-7"],
  },
  {
    definition: {
      title: "Hartree Energy",
      description:
        "The Hartree energy of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["10-8"],
  },
  {
    definition: {
      title: "Magnetic Dipole Moment (Current-area)",
      description:
        "The magnetic dipole moment expressed as current times area. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentMagneticMoment.propertyTypeBaseUrl]:
              {
                $ref: systemPropertyTypes.xComponentMagneticMoment
                  .propertyTypeId,
              },
            [systemPropertyTypes.yComponentMagneticMoment.propertyTypeBaseUrl]:
              {
                $ref: systemPropertyTypes.yComponentMagneticMoment
                  .propertyTypeId,
              },
            [systemPropertyTypes.zComponentMagneticMoment.propertyTypeBaseUrl]:
              {
                $ref: systemPropertyTypes.zComponentMagneticMoment
                  .propertyTypeId,
              },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentMagneticMoment.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentMagneticMoment.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentMagneticMoment.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["10-9.1"],
  },
  {
    definition: {
      title: "Bohr Magneton",
      description:
        "The Bohr magneton of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticMoment.dataTypeId,
        },
      ],
    },
    isoItems: ["10-9.2"],
  },
  {
    definition: {
      title: "Nuclear Magneton",
      description:
        "The nuclear magneton of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticMoment.dataTypeId,
        },
      ],
    },
    isoItems: ["10-9.3"],
  },
  {
    definition: {
      title: "Spin",
      description:
        "The spin of the specified system or process in atomic and nuclear physics. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentAction.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentAction.propertyTypeId,
            },
            [systemPropertyTypes.yComponentAction.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentAction.propertyTypeId,
            },
            [systemPropertyTypes.zComponentAction.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentAction.propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentAction.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentAction.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentAction.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["10-10"],
  },
  {
    definition: {
      title: "Total Angular Momentum",
      description:
        "The total angular momentum of the specified system or process in atomic and nuclear physics. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentAction.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentAction.propertyTypeId,
            },
            [systemPropertyTypes.yComponentAction.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentAction.propertyTypeId,
            },
            [systemPropertyTypes.zComponentAction.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentAction.propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentAction.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentAction.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentAction.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["10-11"],
  },
  {
    definition: {
      title: "Gyromagnetic Ratio",
      description:
        "The gyromagnetic ratio of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.gyromagneticRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["10-12.1"],
  },
  {
    definition: {
      title: "Gyromagnetic Ratio of the Electron",
      description:
        "The gyromagnetic ratio of the electron of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.gyromagneticRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["10-12.2"],
  },
  {
    definition: {
      title: "Quantum Number",
      description:
        "The quantum number of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.halfInteger.dataTypeId,
        },
      ],
    },
    isoItems: ["10-13.1"],
  },
  {
    definition: {
      title: "Principal Quantum Number",
      description:
        "The principal quantum number of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.positiveInteger.dataTypeId,
        },
      ],
    },
    isoItems: ["10-13.2"],
  },
  {
    definition: {
      title: "Orbital Angular Momentum Quantum Number",
      description:
        "The orbital angular momentum quantum number of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.nonNegativeInteger.dataTypeId,
        },
      ],
    },
    isoItems: ["10-13.3"],
  },
  {
    definition: {
      title: "Magnetic Quantum Number",
      description:
        "The magnetic quantum number of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.halfInteger.dataTypeId,
        },
      ],
    },
    isoItems: ["10-13.4"],
  },
  {
    definition: {
      title: "Spin Quantum Number",
      description:
        "The spin quantum number of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.nonNegativeHalfInteger.dataTypeId,
        },
      ],
    },
    isoItems: ["10-13.5"],
  },
  {
    definition: {
      title: "Total Angular Momentum Quantum Number",
      description:
        "The total angular momentum quantum number of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.nonNegativeHalfInteger.dataTypeId,
        },
      ],
    },
    isoItems: ["10-13.6"],
  },
  {
    definition: {
      title: "Nuclear Spin Quantum Number",
      description:
        "The nuclear spin quantum number of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.nonNegativeHalfInteger.dataTypeId,
        },
      ],
    },
    isoItems: ["10-13.7"],
  },
  {
    definition: {
      title: "Hyperfine Structure Quantum Number",
      description:
        "The hyperfine structure quantum number of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.nonNegativeHalfInteger.dataTypeId,
        },
      ],
    },
    isoItems: ["10-13.8"],
  },
  {
    definition: {
      title: "Landé Factor",
      description:
        "The Landé factor of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["10-14.1"],
  },
  {
    definition: {
      title: "G Factor of Nucleus",
      description:
        "The g factor of nucleus of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["10-14.2"],
  },
  {
    definition: {
      title: "Larmor Angular Frequency",
      description:
        "The Larmor angular frequency of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.angularVelocity.dataTypeId,
        },
      ],
    },
    isoItems: ["10-15.1"],
  },
  {
    definition: {
      title: "Larmor Frequency",
      description:
        "The Larmor frequency of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.frequency.dataTypeId,
        },
      ],
    },
    isoItems: ["10-15.2"],
  },
  {
    definition: {
      title: "Nuclear Precession Angular Frequency",
      description:
        "The nuclear precession angular frequency of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.angularVelocity.dataTypeId,
        },
      ],
    },
    isoItems: ["10-15.3"],
  },
  {
    definition: {
      title: "Cyclotron Angular Frequency",
      description:
        "The cyclotron angular frequency of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.angularVelocity.dataTypeId,
        },
      ],
    },
    isoItems: ["10-16"],
  },
  {
    definition: {
      title: "Gyroradius",
      description:
        "The gyroradius of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: ["10-17"],
  },
  {
    definition: {
      title: "Nuclear Quadrupole Moment",
      description:
        "The nuclear quadrupole moment of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.area.dataTypeId,
        },
      ],
    },
    isoItems: ["10-18"],
  },
  {
    definition: {
      title: "Nuclear Radius",
      description:
        "The nuclear radius of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: ["10-19.1"],
  },
  {
    definition: {
      title: "Electron Radius",
      description:
        "The electron radius of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: ["10-19.2"],
  },
  {
    definition: {
      title: "Compton Wavelength",
      description:
        "The Compton wavelength of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: ["10-20"],
  },
  {
    definition: {
      title: "Mass Excess",
      description:
        "The mass excess of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.mass.dataTypeId,
        },
      ],
    },
    isoItems: ["10-21.1"],
  },
  {
    definition: {
      title: "Mass Defect",
      description:
        "The mass defect of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.mass.dataTypeId,
        },
      ],
    },
    isoItems: ["10-21.2"],
  },
  {
    definition: {
      title: "Relative Mass Excess",
      description:
        "The relative mass excess of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["10-22.1"],
  },
  {
    definition: {
      title: "Relative Mass Defect",
      description:
        "The relative mass defect of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["10-22.2"],
  },
  {
    definition: {
      title: "Packing Fraction",
      description:
        "The packing fraction of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["10-23.1"],
  },
  {
    definition: {
      title: "Binding Fraction",
      description:
        "The binding fraction of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["10-23.2"],
  },
  {
    definition: {
      title: "Decay Constant",
      description:
        "The decay constant of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.reciprocalDuration.dataTypeId,
        },
      ],
    },
    isoItems: ["10-24"],
  },
  {
    definition: {
      title: "Mean Duration of Life",
      description:
        "The mean duration of life of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.duration.dataTypeId,
        },
      ],
    },
    isoItems: ["10-25"],
  },
  {
    definition: {
      title: "Level Width",
      description:
        "The level width of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["10-26"],
  },
  {
    definition: {
      title: "Radionuclide Activity",
      description:
        "The expected number of nuclear transformations per unit time.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.radionuclideActivity.dataTypeId,
        },
      ],
    },
    isoItems: ["10-27"],
  },
  {
    definition: {
      title: "Specific Activity",
      description:
        "The specific activity of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.activityPerMass.dataTypeId,
        },
      ],
    },
    isoItems: ["10-28"],
  },
  {
    definition: {
      title: "Activity Density",
      description:
        "The activity density of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.activityPerVolume.dataTypeId,
        },
      ],
    },
    isoItems: ["10-29"],
  },
  {
    definition: {
      title: "Surface-activity Density",
      description:
        "The surface-activity density of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.activityPerArea.dataTypeId,
        },
      ],
    },
    isoItems: ["10-30"],
  },
  {
    definition: {
      title: "Half Life",
      description:
        "The time required for the expected population of an unstable species to decrease by one half.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.duration.dataTypeId,
        },
      ],
    },
    isoItems: ["10-31"],
  },
  {
    definition: {
      title: "Alpha Disintegration Energy",
      description:
        "The alpha disintegration energy of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["10-32"],
  },
  {
    definition: {
      title: "Maximum Beta-particle Energy",
      description:
        "The maximum beta-particle energy of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["10-33"],
  },
  {
    definition: {
      title: "Beta Disintegration Energy",
      description:
        "The beta disintegration energy of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["10-34"],
  },
  {
    definition: {
      title: "Internal Conversion Factor",
      description:
        "The internal conversion factor of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["10-35"],
  },
  {
    definition: {
      title: "Particle Emission Rate",
      description:
        "The particle emission rate of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.reciprocalDuration.dataTypeId,
        },
      ],
    },
    isoItems: ["10-36"],
  },
  {
    definition: {
      title: "Reaction Energy",
      description:
        "The reaction energy of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["10-37.1"],
  },
  {
    definition: {
      title: "Resonance Energy",
      description:
        "The resonance energy of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["10-37.2"],
  },
  {
    definition: {
      title: "Cross Section",
      description:
        "The cross section of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.area.dataTypeId,
        },
      ],
    },
    isoItems: ["10-38.1"],
  },
  {
    definition: {
      title: "Total Cross Section",
      description:
        "The total cross section of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.area.dataTypeId,
        },
      ],
    },
    isoItems: ["10-38.2"],
  },
  {
    definition: {
      title: "Direction Distribution of Cross Section",
      description:
        "The direction distribution of cross section of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.crossSectionPerSolidAngle.dataTypeId,
        },
      ],
    },
    isoItems: ["10-39"],
  },
  {
    definition: {
      title: "Energy Distribution of Cross Section",
      description:
        "The energy distribution of cross section of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.crossSectionPerEnergy.dataTypeId,
        },
      ],
    },
    isoItems: ["10-40"],
  },
  {
    definition: {
      title: "Direction and Energy Distribution of Cross Section",
      description:
        "The direction and energy distribution of cross section of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId:
            systemDataTypes.crossSectionPerEnergyAndSolidAngle.dataTypeId,
        },
      ],
    },
    isoItems: ["10-41"],
  },
  {
    definition: {
      title: "Macroscopic Cross Section",
      description:
        "The macroscopic cross section of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.wavenumber.dataTypeId,
        },
      ],
    },
    isoItems: ["10-42.1"],
  },
  {
    definition: {
      title: "Macroscopic Total Cross Section",
      description:
        "The macroscopic total cross section of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.wavenumber.dataTypeId,
        },
      ],
    },
    isoItems: ["10-42.2"],
  },
  {
    definition: {
      title: "Particle Fluence",
      description:
        "The particle fluence of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.numberPerArea.dataTypeId,
        },
      ],
    },
    isoItems: ["10-43"],
  },
  {
    definition: {
      title: "Particle Fluence Rate",
      description:
        "The particle fluence rate of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.particleFluxDensity.dataTypeId,
        },
      ],
    },
    isoItems: ["10-44"],
  },
  {
    definition: {
      title: "Energy Fluence",
      description:
        "The energy fluence of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energyPerArea.dataTypeId,
        },
      ],
    },
    isoItems: ["10-46"],
  },
  {
    definition: {
      title: "Energy Fluence Rate",
      description:
        "The energy fluence rate of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.heatFluxDensity.dataTypeId,
        },
      ],
    },
    isoItems: ["10-47"],
  },
  {
    definition: {
      title: "Particle Current Density",
      description:
        "The particle current density of the specified system or process in atomic and nuclear physics. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentParticleFluxDensity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentParticleFluxDensity
                .propertyTypeId,
            },
            [systemPropertyTypes.yComponentParticleFluxDensity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentParticleFluxDensity
                .propertyTypeId,
            },
            [systemPropertyTypes.zComponentParticleFluxDensity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentParticleFluxDensity
                .propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentParticleFluxDensity
              .propertyTypeBaseUrl,
            systemPropertyTypes.yComponentParticleFluxDensity
              .propertyTypeBaseUrl,
            systemPropertyTypes.zComponentParticleFluxDensity
              .propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["10-48"],
  },
  {
    definition: {
      title: "Molar Attenuation Coefficient",
      description:
        "The molar attenuation coefficient of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.areaPerAmount.dataTypeId,
        },
      ],
    },
    isoItems: ["10-51"],
  },
  {
    definition: {
      title: "Atomic Attenuation Coefficient",
      description:
        "The atomic attenuation coefficient of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.area.dataTypeId,
        },
      ],
    },
    isoItems: ["10-52"],
  },
  {
    definition: {
      title: "Half-value Thickness",
      description:
        "The half-value thickness of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: ["10-53"],
  },
  {
    definition: {
      title: "Total Linear Stopping Power",
      description:
        "The total linear stopping power of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.spectralEnergyPerWavelength.dataTypeId,
        },
      ],
    },
    isoItems: ["10-54"],
  },
  {
    definition: {
      title: "Total Mass Stopping Power",
      description:
        "The total mass stopping power of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energyAreaPerMass.dataTypeId,
        },
      ],
    },
    isoItems: ["10-55"],
  },
  {
    definition: {
      title: "Mean Linear Range",
      description:
        "The mean linear range of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: ["10-56"],
  },
  {
    definition: {
      title: "Mean Mass Range",
      description:
        "The mean mass range of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.surfaceDensity.dataTypeId,
        },
      ],
    },
    isoItems: ["10-57"],
  },
  {
    definition: {
      title: "Linear Ionization",
      description:
        "The linear ionization of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.wavenumber.dataTypeId,
        },
      ],
    },
    isoItems: ["10-58"],
  },
  {
    definition: {
      title: "Total Ionization",
      description:
        "The total ionization of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.nonNegativeInteger.dataTypeId,
        },
      ],
    },
    isoItems: ["10-59"],
  },
  {
    definition: {
      title: "Average Energy Loss per Elementary Charge Produced",
      description:
        "The average energy loss per elementary charge produced of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["10-60"],
  },
  {
    definition: {
      title: "Particle Mobility",
      description:
        "The mobility of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.mobility.dataTypeId,
        },
      ],
    },
    isoItems: ["10-61"],
  },
  {
    definition: {
      title: "Particle Number Density",
      description:
        "The particle number density of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.numberPerVolume.dataTypeId,
        },
      ],
    },
    isoItems: ["10-62.1"],
  },
  {
    definition: {
      title: "Ion Number Density",
      description:
        "The ion number density of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.numberPerVolume.dataTypeId,
        },
      ],
    },
    isoItems: ["10-62.2"],
  },
  {
    definition: {
      title: "Recombination Coefficient",
      description:
        "The recombination coefficient of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.volumeFlowRate.dataTypeId,
        },
      ],
    },
    isoItems: ["10-63"],
  },
  {
    definition: {
      title: "Diffusion Coefficient for Fluence Rate",
      description:
        "The diffusion coefficient for fluence rate of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: ["10-65"],
  },
  {
    definition: {
      title: "Particle Source Density",
      description:
        "The particle source density of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.particleProductionDensity.dataTypeId,
        },
      ],
    },
    isoItems: ["10-66"],
  },
  {
    definition: {
      title: "Slowing-down Density",
      description:
        "The slowing-down density of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.particleProductionDensity.dataTypeId,
        },
      ],
    },
    isoItems: ["10-67"],
  },
  {
    definition: {
      title: "Resonance Escape Probability",
      description:
        "The resonance escape probability of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
    },
    isoItems: ["10-68"],
  },
  {
    definition: {
      title: "Lethargy",
      description:
        "The lethargy of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["10-69"],
  },
  {
    definition: {
      title: "Average Logarithmic Energy Decrement",
      description:
        "The average logarithmic energy decrement of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["10-70"],
  },
  {
    definition: {
      title: "Slowing-down Area",
      description:
        "The slowing-down area of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.area.dataTypeId,
        },
      ],
    },
    isoItems: ["10-72.1"],
  },
  {
    definition: {
      title: "Diffusion Area",
      description:
        "The diffusion area of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.area.dataTypeId,
        },
      ],
    },
    isoItems: ["10-72.2"],
  },
  {
    definition: {
      title: "Migration Area",
      description:
        "The migration area of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.area.dataTypeId,
        },
      ],
    },
    isoItems: ["10-72.3"],
  },
  {
    definition: {
      title: "Slowing-down Length",
      description:
        "The slowing-down length of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: ["10-73.1"],
  },
  {
    definition: {
      title: "Particle Diffusion Length",
      description:
        "The diffusion length of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: ["10-73.2"],
  },
  {
    definition: {
      title: "Migration Length",
      description:
        "The migration length of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: ["10-73.3"],
  },
  {
    definition: {
      title: "Neutron Yield per Fission",
      description:
        "The neutron yield per fission of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["10-74.1"],
  },
  {
    definition: {
      title: "Neutron Yield per Absorption",
      description:
        "The neutron yield per absorption of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["10-74.2"],
  },
  {
    definition: {
      title: "Fast Fission Factor",
      description:
        "The fast fission factor of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["10-75"],
  },
  {
    definition: {
      title: "Thermal Utilization Factor",
      description:
        "The thermal utilization factor of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
    },
    isoItems: ["10-76"],
  },
  {
    definition: {
      title: "Non-leakage Probability",
      description:
        "The non-leakage probability of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
    },
    isoItems: ["10-77"],
  },
  {
    definition: {
      title: "Multiplication Factor",
      description:
        "The multiplication factor of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["10-78.1"],
  },
  {
    definition: {
      title: "Infinite Multiplication Factor",
      description:
        "The infinite multiplication factor of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["10-78.2"],
  },
  {
    definition: {
      title: "Reactor Time Constant",
      description:
        "The reactor time constant of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.duration.dataTypeId,
        },
      ],
    },
    isoItems: ["10-79"],
  },
  {
    definition: {
      title: "Energy Imparted",
      description:
        "The energy imparted of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["10-80.1"],
  },
  {
    definition: {
      title: "Mean Energy Imparted",
      description:
        "The mean energy imparted of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["10-80.2"],
  },
  {
    definition: {
      title: "Absorbed Dose",
      description:
        "Energy imparted by ionizing radiation divided by the mass receiving it.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.absorbedDose.dataTypeId,
        },
      ],
    },
    isoItems: ["10-81.1"],
  },
  {
    definition: {
      title: "Specific Energy Imparted",
      description:
        "The specific energy imparted of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.absorbedDose.dataTypeId,
        },
      ],
    },
    isoItems: ["10-81.2"],
  },
  {
    definition: {
      title: "Radiation Quality Factor",
      description:
        "The dimensionless factor used to relate absorbed dose to dose equivalent.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["10-82"],
  },
  {
    definition: {
      title: "Dose Equivalent",
      description:
        "Absorbed dose weighted by the specified radiation quality factor.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.doseEquivalent.dataTypeId,
        },
      ],
    },
    isoItems: ["10-83.1"],
  },
  {
    definition: {
      title: "Dose Equivalent Rate",
      description:
        "The dose equivalent rate of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.doseEquivalentRate.dataTypeId,
        },
      ],
    },
    isoItems: ["10-83.2"],
  },
  {
    definition: {
      title: "Absorbed-dose Rate",
      description:
        "The absorbed-dose rate of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.absorbedDoseRate.dataTypeId,
        },
      ],
    },
    isoItems: ["10-84"],
  },
  {
    definition: {
      title: "Linear Energy Transfer",
      description:
        "The linear energy transfer of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.spectralEnergyPerWavelength.dataTypeId,
        },
      ],
    },
    isoItems: ["10-85"],
  },
  {
    definition: {
      title: "Kerma",
      description:
        "The kerma of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.absorbedDose.dataTypeId,
        },
      ],
    },
    isoItems: ["10-86.1"],
  },
  {
    definition: {
      title: "Kerma Rate",
      description:
        "The kerma rate of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.absorbedDoseRate.dataTypeId,
        },
      ],
    },
    isoItems: ["10-86.2"],
  },
  {
    definition: {
      title: "Mass Energy-transfer Coefficient",
      description:
        "The mass energy-transfer coefficient of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.areaPerMass.dataTypeId,
        },
      ],
    },
    isoItems: ["10-87"],
  },
  {
    definition: {
      title: "Radiation Exposure",
      description:
        "The charge of ions of one sign produced in air divided by the mass of air.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.radiationExposure.dataTypeId,
        },
      ],
    },
    isoItems: ["10-88"],
  },
  {
    definition: {
      title: "Radiation Exposure Rate",
      description:
        "The exposure rate of the specified system or process in atomic and nuclear physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.exposureRate.dataTypeId,
        },
      ],
    },
    isoItems: ["10-89"],
  },
];

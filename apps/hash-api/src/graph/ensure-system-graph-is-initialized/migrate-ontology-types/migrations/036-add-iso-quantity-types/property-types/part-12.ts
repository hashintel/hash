import {
  systemDataTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { IsoPropertyType } from "../property-types";

export const part12PropertyTypes: IsoPropertyType[] = [
  {
    definition: {
      title: "Lattice Vector",
      description:
        "The lattice vector of the specified system or process in condensed matter physics. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentLength.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentLength.propertyTypeId,
            },
            [systemPropertyTypes.yComponentLength.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentLength.propertyTypeId,
            },
            [systemPropertyTypes.zComponentLength.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentLength.propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentLength.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentLength.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentLength.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["12-1.1"],
  },
  {
    definition: {
      title: "Fundamental Lattice Vectors",
      description:
        "The fundamental lattice vectors of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.firstLatticeBasisVector.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.firstLatticeBasisVector.propertyTypeId,
            },
            [systemPropertyTypes.secondLatticeBasisVector.propertyTypeBaseUrl]:
              {
                $ref: systemPropertyTypes.secondLatticeBasisVector
                  .propertyTypeId,
              },
            [systemPropertyTypes.thirdLatticeBasisVector.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.thirdLatticeBasisVector.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.firstLatticeBasisVector.propertyTypeBaseUrl,
            systemPropertyTypes.secondLatticeBasisVector.propertyTypeBaseUrl,
            systemPropertyTypes.thirdLatticeBasisVector.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["12-1.2"],
  },
  {
    definition: {
      title: "Angular Reciprocal Lattice Vector",
      description:
        "The angular reciprocal lattice vector of the specified system or process in condensed matter physics. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentWavenumber.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentWavenumber.propertyTypeId,
            },
            [systemPropertyTypes.yComponentWavenumber.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentWavenumber.propertyTypeId,
            },
            [systemPropertyTypes.zComponentWavenumber.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentWavenumber.propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentWavenumber.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentWavenumber.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentWavenumber.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["12-2.1"],
  },
  {
    definition: {
      title: "Fundamental Reciprocal Lattice Vectors",
      description:
        "The fundamental reciprocal lattice vectors of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.firstReciprocalLatticeBasisVector
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.firstReciprocalLatticeBasisVector
                .propertyTypeId,
            },
            [systemPropertyTypes.secondReciprocalLatticeBasisVector
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.secondReciprocalLatticeBasisVector
                .propertyTypeId,
            },
            [systemPropertyTypes.thirdReciprocalLatticeBasisVector
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.thirdReciprocalLatticeBasisVector
                .propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.firstReciprocalLatticeBasisVector
              .propertyTypeBaseUrl,
            systemPropertyTypes.secondReciprocalLatticeBasisVector
              .propertyTypeBaseUrl,
            systemPropertyTypes.thirdReciprocalLatticeBasisVector
              .propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["12-2.2"],
  },
  {
    definition: {
      title: "Lattice Plane Spacing",
      description:
        "The lattice plane spacing of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: ["12-3"],
  },
  {
    definition: {
      title: "Bragg Angle",
      description:
        "The Bragg angle of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.angle.dataTypeId,
        },
      ],
    },
    isoItems: ["12-4"],
  },
  {
    definition: {
      title: "Short-range Order Parameter",
      description:
        "The short-range order parameter of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["12-5.1"],
  },
  {
    definition: {
      title: "Long-range Order Parameter",
      description:
        "The long-range order parameter of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["12-5.2"],
  },
  {
    definition: {
      title: "Atomic Scattering Factor",
      description:
        "The atomic scattering factor of the specified system or process in condensed matter physics. The real and imaginary components use the same unit family.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.realPartDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.realPartDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.imaginaryPartDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.imaginaryPartDimensionlessRatio
                .propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.realPartDimensionlessRatio.propertyTypeBaseUrl,
            systemPropertyTypes.imaginaryPartDimensionlessRatio
              .propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["12-5.3"],
  },
  {
    definition: {
      title: "Structure Factor",
      description:
        "The structure factor of the specified system or process in condensed matter physics. The real and imaginary components use the same unit family.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.realPartDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.realPartDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.imaginaryPartDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.imaginaryPartDimensionlessRatio
                .propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.realPartDimensionlessRatio.propertyTypeBaseUrl,
            systemPropertyTypes.imaginaryPartDimensionlessRatio
              .propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["12-5.4"],
  },
  {
    definition: {
      title: "Burgers Vector",
      description:
        "The Burgers vector of the specified system or process in condensed matter physics. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentLength.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentLength.propertyTypeId,
            },
            [systemPropertyTypes.yComponentLength.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentLength.propertyTypeId,
            },
            [systemPropertyTypes.zComponentLength.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentLength.propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentLength.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentLength.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentLength.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["12-6"],
  },
  {
    definition: {
      title: "Particle Position Vector",
      description:
        "The particle position vector of the specified system or process in condensed matter physics. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentLength.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentLength.propertyTypeId,
            },
            [systemPropertyTypes.yComponentLength.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentLength.propertyTypeId,
            },
            [systemPropertyTypes.zComponentLength.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentLength.propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentLength.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentLength.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentLength.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["12-7.1"],
  },
  {
    definition: {
      title: "Equilibrium Position Vector",
      description:
        "The equilibrium position vector of the specified system or process in condensed matter physics. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentLength.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentLength.propertyTypeId,
            },
            [systemPropertyTypes.yComponentLength.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentLength.propertyTypeId,
            },
            [systemPropertyTypes.zComponentLength.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentLength.propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentLength.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentLength.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentLength.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["12-7.2"],
  },
  {
    definition: {
      title: "Displacement Vector",
      description:
        "The displacement vector of the specified system or process in condensed matter physics. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentLength.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentLength.propertyTypeId,
            },
            [systemPropertyTypes.yComponentLength.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentLength.propertyTypeId,
            },
            [systemPropertyTypes.zComponentLength.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentLength.propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentLength.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentLength.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentLength.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["12-7.3"],
  },
  {
    definition: {
      title: "Debye-Waller Factor",
      description:
        "The Debye-Waller factor of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["12-8"],
  },
  {
    definition: {
      title: "Fermi Angular Wavenumber",
      description:
        "The Fermi angular wavenumber of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.angularWavenumber.dataTypeId,
        },
      ],
    },
    isoItems: ["12-9.2"],
  },
  {
    definition: {
      title: "Debye Angular Wavenumber",
      description:
        "The Debye angular wavenumber of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.angularWavenumber.dataTypeId,
        },
      ],
    },
    isoItems: ["12-9.3"],
  },
  {
    definition: {
      title: "Debye Angular Frequency",
      description:
        "The Debye angular frequency of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.angularVelocity.dataTypeId,
        },
      ],
    },
    isoItems: ["12-10"],
  },
  {
    definition: {
      title: "Debye Temperature",
      description:
        "The Debye temperature of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.temperature.dataTypeId,
        },
      ],
    },
    isoItems: ["12-11"],
  },
  {
    definition: {
      title: "Density of Vibrational States",
      description:
        "The density of vibrational states of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.vibrationalDensityOfStates.dataTypeId,
        },
      ],
    },
    isoItems: ["12-12"],
  },
  {
    definition: {
      title: "Thermodynamic Grüneisen Parameter",
      description:
        "The thermodynamic Grüneisen parameter of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["12-13"],
  },
  {
    definition: {
      title: "Grüneisen Parameter",
      description:
        "The Grüneisen parameter of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["12-14"],
  },
  {
    definition: {
      title: "Mean Free Path of Phonons",
      description:
        "The mean free path of phonons of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: ["12-15.1"],
  },
  {
    definition: {
      title: "Mean Free Path of Electrons",
      description:
        "The mean free path of electrons of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: ["12-15.2"],
  },
  {
    definition: {
      title: "Energy Density of States",
      description:
        "The energy density of states of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energyDensityOfStates.dataTypeId,
        },
      ],
    },
    isoItems: ["12-16"],
  },
  {
    definition: {
      title: "Residual Resistivity",
      description:
        "The residual resistivity of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricResistivity.dataTypeId,
        },
      ],
    },
    isoItems: ["12-17"],
  },
  {
    definition: {
      title: "Lorenz Coefficient",
      description:
        "The Lorenz coefficient of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.lorenzCoefficient.dataTypeId,
        },
      ],
    },
    isoItems: ["12-18"],
  },
  {
    definition: {
      title: "Hall Coefficient",
      description:
        "The Hall coefficient of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.hallCoefficient.dataTypeId,
        },
      ],
    },
    isoItems: ["12-19"],
  },
  {
    definition: {
      title: "Thermoelectric Voltage",
      description:
        "The thermoelectric voltage of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricPotentialDifference.dataTypeId,
        },
      ],
    },
    isoItems: ["12-20"],
  },
  {
    definition: {
      title: "Seebeck Coefficient",
      description:
        "The Seebeck coefficient of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.thermoelectricCoefficient.dataTypeId,
        },
      ],
    },
    isoItems: ["12-21"],
  },
  {
    definition: {
      title: "Peltier Coefficient",
      description:
        "The Peltier coefficient of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricPotentialDifference.dataTypeId,
        },
      ],
    },
    isoItems: ["12-22"],
  },
  {
    definition: {
      title: "Thomson Coefficient",
      description:
        "The Thomson coefficient of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.thermoelectricCoefficient.dataTypeId,
        },
      ],
    },
    isoItems: ["12-23"],
  },
  {
    definition: {
      title: "Work Function",
      description:
        "The work function of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["12-24.1"],
  },
  {
    definition: {
      title: "Ionization Energy",
      description:
        "The ionization energy of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["12-24.2"],
  },
  {
    definition: {
      title: "Electron Affinity",
      description:
        "The electron affinity of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["12-25"],
  },
  {
    definition: {
      title: "Richardson Constant",
      description:
        "The Richardson constant of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.richardsonConstant.dataTypeId,
        },
      ],
    },
    isoItems: ["12-26"],
  },
  {
    definition: {
      title: "Fermi Energy",
      description:
        "The Fermi energy of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["12-27.1"],
  },
  {
    definition: {
      title: "Gap Energy",
      description:
        "The gap energy of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["12-27.2"],
  },
  {
    definition: {
      title: "Fermi Temperature",
      description:
        "The Fermi temperature of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.temperature.dataTypeId,
        },
      ],
    },
    isoItems: ["12-28"],
  },
  {
    definition: {
      title: "Electron Density",
      description:
        "The electron density of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.numberPerVolume.dataTypeId,
        },
      ],
    },
    isoItems: ["12-29.1"],
  },
  {
    definition: {
      title: "Hole Density",
      description:
        "The hole density of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.numberPerVolume.dataTypeId,
        },
      ],
    },
    isoItems: ["12-29.2"],
  },
  {
    definition: {
      title: "Intrinsic Carrier Density",
      description:
        "The intrinsic carrier density of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.numberPerVolume.dataTypeId,
        },
      ],
    },
    isoItems: ["12-29.3"],
  },
  {
    definition: {
      title: "Donor Density",
      description:
        "The donor density of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.numberPerVolume.dataTypeId,
        },
      ],
    },
    isoItems: ["12-29.4"],
  },
  {
    definition: {
      title: "Acceptor Density",
      description:
        "The acceptor density of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.numberPerVolume.dataTypeId,
        },
      ],
    },
    isoItems: ["12-29.5"],
  },
  {
    definition: {
      title: "Effective Mass",
      description:
        "The effective mass of the specified system or process in condensed matter physics. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.mass.dataTypeId,
        },
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xxComponentMass.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xxComponentMass.propertyTypeId,
            },
            [systemPropertyTypes.xyComponentMass.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xyComponentMass.propertyTypeId,
            },
            [systemPropertyTypes.xzComponentMass.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xzComponentMass.propertyTypeId,
            },
            [systemPropertyTypes.yxComponentMass.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yxComponentMass.propertyTypeId,
            },
            [systemPropertyTypes.yyComponentMass.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yyComponentMass.propertyTypeId,
            },
            [systemPropertyTypes.yzComponentMass.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yzComponentMass.propertyTypeId,
            },
            [systemPropertyTypes.zxComponentMass.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zxComponentMass.propertyTypeId,
            },
            [systemPropertyTypes.zyComponentMass.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zyComponentMass.propertyTypeId,
            },
            [systemPropertyTypes.zzComponentMass.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zzComponentMass.propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xxComponentMass.propertyTypeBaseUrl,
            systemPropertyTypes.xyComponentMass.propertyTypeBaseUrl,
            systemPropertyTypes.xzComponentMass.propertyTypeBaseUrl,
            systemPropertyTypes.yxComponentMass.propertyTypeBaseUrl,
            systemPropertyTypes.yyComponentMass.propertyTypeBaseUrl,
            systemPropertyTypes.yzComponentMass.propertyTypeBaseUrl,
            systemPropertyTypes.zxComponentMass.propertyTypeBaseUrl,
            systemPropertyTypes.zyComponentMass.propertyTypeBaseUrl,
            systemPropertyTypes.zzComponentMass.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["12-30"],
  },
  {
    definition: {
      title: "Mobility Ratio",
      description:
        "The mobility ratio of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["12-31"],
  },
  {
    definition: {
      title: "Relaxation Time",
      description:
        "The relaxation time of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.duration.dataTypeId,
        },
      ],
    },
    isoItems: ["12-32.1"],
  },
  {
    definition: {
      title: "Carrier Lifetime",
      description:
        "The carrier lifetime of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.duration.dataTypeId,
        },
      ],
    },
    isoItems: ["12-32.2"],
  },
  {
    definition: {
      title: "Carrier Diffusion Length",
      description:
        "The diffusion length of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: ["12-33"],
  },
  {
    definition: {
      title: "Exchange Integral",
      description:
        "The exchange integral of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["12-34"],
  },
  {
    definition: {
      title: "Curie Temperature",
      description:
        "The Curie temperature of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.temperature.dataTypeId,
        },
      ],
    },
    isoItems: ["12-35.1"],
  },
  {
    definition: {
      title: "Néel Temperature",
      description:
        "The Néel temperature of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.temperature.dataTypeId,
        },
      ],
    },
    isoItems: ["12-35.2"],
  },
  {
    definition: {
      title: "Superconducting Transition Temperature",
      description:
        "The superconduction transition temperature of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.temperature.dataTypeId,
        },
      ],
    },
    isoItems: ["12-35.3"],
  },
  {
    definition: {
      title: "Thermodynamic Critical Magnetic Flux Density",
      description:
        "The thermodynamic critical magnetic flux density of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticFluxDensity.dataTypeId,
        },
      ],
    },
    isoItems: ["12-36.1"],
  },
  {
    definition: {
      title: "Lower Critical Magnetic Flux Density",
      description:
        "The lower critical magnetic flux density of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticFluxDensity.dataTypeId,
        },
      ],
    },
    isoItems: ["12-36.2"],
  },
  {
    definition: {
      title: "Upper Critical Magnetic Flux Density",
      description:
        "The upper critical magnetic flux density of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticFluxDensity.dataTypeId,
        },
      ],
    },
    isoItems: ["12-36.3"],
  },
  {
    definition: {
      title: "Superconductor Energy Gap",
      description:
        "The superconductor energy gap of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["12-37"],
  },
  {
    definition: {
      title: "London Penetration Depth",
      description:
        "The London penetration depth of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: ["12-38.1"],
  },
  {
    definition: {
      title: "Coherence Length",
      description:
        "The coherence length of the specified system or process in condensed matter physics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: ["12-38.2"],
  },
];

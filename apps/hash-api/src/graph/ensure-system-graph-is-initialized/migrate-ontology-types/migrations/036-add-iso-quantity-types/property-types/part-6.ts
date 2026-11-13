import {
  systemDataTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { IsoPropertyType } from "../property-types";

export const part6PropertyTypes: IsoPropertyType[] = [
  {
    definition: {
      title: "Electric Current",
      description:
        "The electric current of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricCurrent.dataTypeId,
        },
      ],
    },
    isoItems: ["6-1"],
  },
  {
    definition: {
      title: "Electric Charge",
      description:
        "The electric charge of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricCharge.dataTypeId,
        },
      ],
    },
    isoItems: ["6-2.1"],
  },
  {
    definition: {
      title: "Elementary Charge",
      description:
        "The elementary charge of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricCharge.dataTypeId,
        },
      ],
    },
    isoItems: ["6-2.2", "10-5.1"],
  },
  {
    definition: {
      title: "Electric Charge Density",
      description:
        "The electric charge density of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricChargeDensity.dataTypeId,
        },
      ],
    },
    isoItems: ["6-3"],
  },
  {
    definition: {
      title: "Surface Density of Electric Charge",
      description:
        "The surface density of electric charge of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.surfaceChargeDensity.dataTypeId,
        },
      ],
    },
    isoItems: ["6-4"],
  },
  {
    definition: {
      title: "Linear Density of Electric Charge",
      description:
        "The linear density of electric charge of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.linearChargeDensity.dataTypeId,
        },
      ],
    },
    isoItems: ["6-5"],
  },
  {
    definition: {
      title: "Electric Dipole Moment",
      description:
        "The electric dipole moment of the specified system or process in electromagnetism. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentElectricDipoleMoment
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentElectricDipoleMoment
                .propertyTypeId,
            },
            [systemPropertyTypes.yComponentElectricDipoleMoment
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentElectricDipoleMoment
                .propertyTypeId,
            },
            [systemPropertyTypes.zComponentElectricDipoleMoment
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentElectricDipoleMoment
                .propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentElectricDipoleMoment
              .propertyTypeBaseUrl,
            systemPropertyTypes.yComponentElectricDipoleMoment
              .propertyTypeBaseUrl,
            systemPropertyTypes.zComponentElectricDipoleMoment
              .propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["6-6"],
  },
  {
    definition: {
      title: "Electric Polarization",
      description:
        "The electric polarization of the specified system or process in electromagnetism. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentSurfaceChargeDensity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentSurfaceChargeDensity
                .propertyTypeId,
            },
            [systemPropertyTypes.yComponentSurfaceChargeDensity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentSurfaceChargeDensity
                .propertyTypeId,
            },
            [systemPropertyTypes.zComponentSurfaceChargeDensity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentSurfaceChargeDensity
                .propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentSurfaceChargeDensity
              .propertyTypeBaseUrl,
            systemPropertyTypes.yComponentSurfaceChargeDensity
              .propertyTypeBaseUrl,
            systemPropertyTypes.zComponentSurfaceChargeDensity
              .propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["6-7"],
  },
  {
    definition: {
      title: "Electric Current Density",
      description:
        "The electric current density of the specified system or process in electromagnetism. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentElectricCurrentDensity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentElectricCurrentDensity
                .propertyTypeId,
            },
            [systemPropertyTypes.yComponentElectricCurrentDensity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentElectricCurrentDensity
                .propertyTypeId,
            },
            [systemPropertyTypes.zComponentElectricCurrentDensity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentElectricCurrentDensity
                .propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentElectricCurrentDensity
              .propertyTypeBaseUrl,
            systemPropertyTypes.yComponentElectricCurrentDensity
              .propertyTypeBaseUrl,
            systemPropertyTypes.zComponentElectricCurrentDensity
              .propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["6-8"],
  },
  {
    definition: {
      title: "Linear Electric Current Density",
      description:
        "The linear electric current density of the specified system or process in electromagnetism. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentMagneticFieldStrength
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentMagneticFieldStrength
                .propertyTypeId,
            },
            [systemPropertyTypes.yComponentMagneticFieldStrength
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentMagneticFieldStrength
                .propertyTypeId,
            },
            [systemPropertyTypes.zComponentMagneticFieldStrength
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentMagneticFieldStrength
                .propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentMagneticFieldStrength
              .propertyTypeBaseUrl,
            systemPropertyTypes.yComponentMagneticFieldStrength
              .propertyTypeBaseUrl,
            systemPropertyTypes.zComponentMagneticFieldStrength
              .propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["6-9"],
  },
  {
    definition: {
      title: "Electric Field Strength",
      description:
        "The electric field strength of the specified system or process in electromagnetism. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentElectricFieldStrength
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentElectricFieldStrength
                .propertyTypeId,
            },
            [systemPropertyTypes.yComponentElectricFieldStrength
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentElectricFieldStrength
                .propertyTypeId,
            },
            [systemPropertyTypes.zComponentElectricFieldStrength
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentElectricFieldStrength
                .propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentElectricFieldStrength
              .propertyTypeBaseUrl,
            systemPropertyTypes.yComponentElectricFieldStrength
              .propertyTypeBaseUrl,
            systemPropertyTypes.zComponentElectricFieldStrength
              .propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["6-10"],
  },
  {
    definition: {
      title: "Electric Potential",
      description:
        "The electric potential of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricPotentialDifference.dataTypeId,
        },
      ],
    },
    isoItems: ["6-11.1"],
  },
  {
    definition: {
      title: "Electric Potential Difference",
      description:
        "The electric potential difference of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricPotentialDifference.dataTypeId,
        },
      ],
    },
    isoItems: ["6-11.2"],
  },
  {
    definition: {
      title: "Voltage",
      description:
        "The voltage of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricPotentialDifference.dataTypeId,
        },
      ],
    },
    isoItems: ["6-11.3"],
  },
  {
    definition: {
      title: "Induced Voltage",
      description:
        "The induced voltage of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricPotentialDifference.dataTypeId,
        },
      ],
    },
    isoItems: ["6-11.4"],
  },
  {
    definition: {
      title: "Electric Flux Density",
      description:
        "The electric flux density of the specified system or process in electromagnetism. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentSurfaceChargeDensity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentSurfaceChargeDensity
                .propertyTypeId,
            },
            [systemPropertyTypes.yComponentSurfaceChargeDensity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentSurfaceChargeDensity
                .propertyTypeId,
            },
            [systemPropertyTypes.zComponentSurfaceChargeDensity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentSurfaceChargeDensity
                .propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentSurfaceChargeDensity
              .propertyTypeBaseUrl,
            systemPropertyTypes.yComponentSurfaceChargeDensity
              .propertyTypeBaseUrl,
            systemPropertyTypes.zComponentSurfaceChargeDensity
              .propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["6-12"],
  },
  {
    definition: {
      title: "Capacitance",
      description:
        "The capacitance of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.capacitance.dataTypeId,
        },
      ],
    },
    isoItems: ["6-13"],
  },
  {
    definition: {
      title: "Electric Constant",
      description:
        "The electric constant of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.permittivity.dataTypeId,
        },
      ],
    },
    isoItems: ["6-14.1"],
  },
  {
    definition: {
      title: "Permittivity",
      description:
        "The permittivity of the specified system or process in electromagnetism. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.permittivity.dataTypeId,
        },
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xxComponentPermittivity.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xxComponentPermittivity.propertyTypeId,
            },
            [systemPropertyTypes.xyComponentPermittivity.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xyComponentPermittivity.propertyTypeId,
            },
            [systemPropertyTypes.xzComponentPermittivity.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xzComponentPermittivity.propertyTypeId,
            },
            [systemPropertyTypes.yxComponentPermittivity.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yxComponentPermittivity.propertyTypeId,
            },
            [systemPropertyTypes.yyComponentPermittivity.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yyComponentPermittivity.propertyTypeId,
            },
            [systemPropertyTypes.yzComponentPermittivity.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yzComponentPermittivity.propertyTypeId,
            },
            [systemPropertyTypes.zxComponentPermittivity.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zxComponentPermittivity.propertyTypeId,
            },
            [systemPropertyTypes.zyComponentPermittivity.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zyComponentPermittivity.propertyTypeId,
            },
            [systemPropertyTypes.zzComponentPermittivity.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zzComponentPermittivity.propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xxComponentPermittivity.propertyTypeBaseUrl,
            systemPropertyTypes.xyComponentPermittivity.propertyTypeBaseUrl,
            systemPropertyTypes.xzComponentPermittivity.propertyTypeBaseUrl,
            systemPropertyTypes.yxComponentPermittivity.propertyTypeBaseUrl,
            systemPropertyTypes.yyComponentPermittivity.propertyTypeBaseUrl,
            systemPropertyTypes.yzComponentPermittivity.propertyTypeBaseUrl,
            systemPropertyTypes.zxComponentPermittivity.propertyTypeBaseUrl,
            systemPropertyTypes.zyComponentPermittivity.propertyTypeBaseUrl,
            systemPropertyTypes.zzComponentPermittivity.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["6-14.2"],
  },
  {
    definition: {
      title: "Relative Permittivity",
      description:
        "The relative permittivity of the specified system or process in electromagnetism. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xxComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xxComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.xyComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xyComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.xzComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xzComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.yxComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yxComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.yyComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yyComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.yzComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yzComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.zxComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zxComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.zyComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zyComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.zzComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zzComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xxComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.xyComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.xzComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.yxComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.yyComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.yzComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.zxComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.zyComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.zzComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["6-15"],
  },
  {
    definition: {
      title: "Electric Susceptibility",
      description:
        "The electric susceptibility of the specified system or process in electromagnetism. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xxComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xxComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.xyComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xyComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.xzComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xzComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.yxComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yxComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.yyComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yyComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.yzComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yzComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.zxComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zxComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.zyComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zyComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.zzComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zzComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xxComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.xyComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.xzComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.yxComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.yyComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.yzComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.zxComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.zyComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.zzComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["6-16"],
  },
  {
    definition: {
      title: "Electric Flux",
      description:
        "The electric flux of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricCharge.dataTypeId,
        },
      ],
    },
    isoItems: ["6-17"],
  },
  {
    definition: {
      title: "Displacement Current Density",
      description:
        "The displacement current density of the specified system or process in electromagnetism. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentElectricCurrentDensity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentElectricCurrentDensity
                .propertyTypeId,
            },
            [systemPropertyTypes.yComponentElectricCurrentDensity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentElectricCurrentDensity
                .propertyTypeId,
            },
            [systemPropertyTypes.zComponentElectricCurrentDensity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentElectricCurrentDensity
                .propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentElectricCurrentDensity
              .propertyTypeBaseUrl,
            systemPropertyTypes.yComponentElectricCurrentDensity
              .propertyTypeBaseUrl,
            systemPropertyTypes.zComponentElectricCurrentDensity
              .propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["6-18"],
  },
  {
    definition: {
      title: "Displacement Current",
      description:
        "The displacement current of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricCurrent.dataTypeId,
        },
      ],
    },
    isoItems: ["6-19.1"],
  },
  {
    definition: {
      title: "Total Current",
      description:
        "The total current of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricCurrent.dataTypeId,
        },
      ],
    },
    isoItems: ["6-19.2"],
  },
  {
    definition: {
      title: "Total Current Density",
      description:
        "The total current density of the specified system or process in electromagnetism. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentElectricCurrentDensity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentElectricCurrentDensity
                .propertyTypeId,
            },
            [systemPropertyTypes.yComponentElectricCurrentDensity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentElectricCurrentDensity
                .propertyTypeId,
            },
            [systemPropertyTypes.zComponentElectricCurrentDensity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentElectricCurrentDensity
                .propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentElectricCurrentDensity
              .propertyTypeBaseUrl,
            systemPropertyTypes.yComponentElectricCurrentDensity
              .propertyTypeBaseUrl,
            systemPropertyTypes.zComponentElectricCurrentDensity
              .propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["6-20"],
  },
  {
    definition: {
      title: "Magnetic Flux Density",
      description:
        "The magnetic flux density of the specified system or process in electromagnetism. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentMagneticFluxDensity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentMagneticFluxDensity
                .propertyTypeId,
            },
            [systemPropertyTypes.yComponentMagneticFluxDensity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentMagneticFluxDensity
                .propertyTypeId,
            },
            [systemPropertyTypes.zComponentMagneticFluxDensity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentMagneticFluxDensity
                .propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentMagneticFluxDensity
              .propertyTypeBaseUrl,
            systemPropertyTypes.yComponentMagneticFluxDensity
              .propertyTypeBaseUrl,
            systemPropertyTypes.zComponentMagneticFluxDensity
              .propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["6-21"],
  },
  {
    definition: {
      title: "Magnetic Flux",
      description:
        "The magnetic flux of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticFlux.dataTypeId,
        },
      ],
    },
    isoItems: ["6-22.1"],
  },
  {
    definition: {
      title: "Protoflux",
      description:
        "The protoflux of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticFlux.dataTypeId,
        },
      ],
    },
    isoItems: ["6-22.2"],
  },
  {
    definition: {
      title: "Linked Magnetic Flux",
      description:
        "The linked magnetic flux of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticFlux.dataTypeId,
        },
      ],
    },
    isoItems: ["6-22.3"],
  },
  {
    definition: {
      title: "Total Magnetic Flux",
      description:
        "The total magnetic flux of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticFlux.dataTypeId,
        },
      ],
    },
    isoItems: ["6-22.4"],
  },
  {
    definition: {
      title: "Magnetic Moment",
      description:
        "The magnetic moment of the specified system or process in electromagnetism. Components use the stated right-handed orthonormal Cartesian reference frame.",
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
    isoItems: ["6-23"],
  },
  {
    definition: {
      title: "Magnetization",
      description:
        "The magnetization of the specified system or process in electromagnetism. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentMagneticFieldStrength
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentMagneticFieldStrength
                .propertyTypeId,
            },
            [systemPropertyTypes.yComponentMagneticFieldStrength
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentMagneticFieldStrength
                .propertyTypeId,
            },
            [systemPropertyTypes.zComponentMagneticFieldStrength
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentMagneticFieldStrength
                .propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentMagneticFieldStrength
              .propertyTypeBaseUrl,
            systemPropertyTypes.yComponentMagneticFieldStrength
              .propertyTypeBaseUrl,
            systemPropertyTypes.zComponentMagneticFieldStrength
              .propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["6-24"],
  },
  {
    definition: {
      title: "Magnetic Field Strength",
      description:
        "The magnetic field strength of the specified system or process in electromagnetism. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentMagneticFieldStrength
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentMagneticFieldStrength
                .propertyTypeId,
            },
            [systemPropertyTypes.yComponentMagneticFieldStrength
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentMagneticFieldStrength
                .propertyTypeId,
            },
            [systemPropertyTypes.zComponentMagneticFieldStrength
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentMagneticFieldStrength
                .propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentMagneticFieldStrength
              .propertyTypeBaseUrl,
            systemPropertyTypes.yComponentMagneticFieldStrength
              .propertyTypeBaseUrl,
            systemPropertyTypes.zComponentMagneticFieldStrength
              .propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["6-25"],
  },
  {
    definition: {
      title: "Magnetic Constant",
      description:
        "The magnetic constant of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticPermeability.dataTypeId,
        },
      ],
    },
    isoItems: ["6-26.1"],
  },
  {
    definition: {
      title: "Magnetic Permeability",
      description:
        "The scalar or tensor relating magnetic flux density to magnetic field strength under stated conditions. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticPermeability.dataTypeId,
        },
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xxComponentMagneticPermeability
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xxComponentMagneticPermeability
                .propertyTypeId,
            },
            [systemPropertyTypes.xyComponentMagneticPermeability
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xyComponentMagneticPermeability
                .propertyTypeId,
            },
            [systemPropertyTypes.xzComponentMagneticPermeability
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xzComponentMagneticPermeability
                .propertyTypeId,
            },
            [systemPropertyTypes.yxComponentMagneticPermeability
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yxComponentMagneticPermeability
                .propertyTypeId,
            },
            [systemPropertyTypes.yyComponentMagneticPermeability
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yyComponentMagneticPermeability
                .propertyTypeId,
            },
            [systemPropertyTypes.yzComponentMagneticPermeability
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yzComponentMagneticPermeability
                .propertyTypeId,
            },
            [systemPropertyTypes.zxComponentMagneticPermeability
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zxComponentMagneticPermeability
                .propertyTypeId,
            },
            [systemPropertyTypes.zyComponentMagneticPermeability
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zyComponentMagneticPermeability
                .propertyTypeId,
            },
            [systemPropertyTypes.zzComponentMagneticPermeability
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zzComponentMagneticPermeability
                .propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xxComponentMagneticPermeability
              .propertyTypeBaseUrl,
            systemPropertyTypes.xyComponentMagneticPermeability
              .propertyTypeBaseUrl,
            systemPropertyTypes.xzComponentMagneticPermeability
              .propertyTypeBaseUrl,
            systemPropertyTypes.yxComponentMagneticPermeability
              .propertyTypeBaseUrl,
            systemPropertyTypes.yyComponentMagneticPermeability
              .propertyTypeBaseUrl,
            systemPropertyTypes.yzComponentMagneticPermeability
              .propertyTypeBaseUrl,
            systemPropertyTypes.zxComponentMagneticPermeability
              .propertyTypeBaseUrl,
            systemPropertyTypes.zyComponentMagneticPermeability
              .propertyTypeBaseUrl,
            systemPropertyTypes.zzComponentMagneticPermeability
              .propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["6-26.2"],
  },
  {
    definition: {
      title: "Relative Magnetic Permeability",
      description:
        "Magnetic permeability relative to vacuum permeability. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xxComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xxComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.xyComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xyComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.xzComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xzComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.yxComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yxComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.yyComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yyComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.yzComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yzComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.zxComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zxComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.zyComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zyComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.zzComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zzComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xxComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.xyComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.xzComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.yxComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.yyComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.yzComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.zxComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.zyComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.zzComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["6-27"],
  },
  {
    definition: {
      title: "Magnetic Susceptibility",
      description:
        "The magnetic susceptibility of the specified system or process in electromagnetism. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xxComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xxComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.xyComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xyComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.xzComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xzComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.yxComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yxComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.yyComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yyComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.yzComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yzComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.zxComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zxComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.zyComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zyComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.zzComponentDimensionlessRatio
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zzComponentDimensionlessRatio
                .propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xxComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.xyComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.xzComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.yxComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.yyComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.yzComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.zxComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.zyComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.zzComponentDimensionlessRatio
              .propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["6-28"],
  },
  {
    definition: {
      title: "Magnetic Polarization",
      description:
        "The magnetic polarization of the specified system or process in electromagnetism. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentMagneticFluxDensity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentMagneticFluxDensity
                .propertyTypeId,
            },
            [systemPropertyTypes.yComponentMagneticFluxDensity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentMagneticFluxDensity
                .propertyTypeId,
            },
            [systemPropertyTypes.zComponentMagneticFluxDensity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentMagneticFluxDensity
                .propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentMagneticFluxDensity
              .propertyTypeBaseUrl,
            systemPropertyTypes.yComponentMagneticFluxDensity
              .propertyTypeBaseUrl,
            systemPropertyTypes.zComponentMagneticFluxDensity
              .propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["6-29"],
  },
  {
    definition: {
      title: "Magnetic Dipole Moment (Flux-length)",
      description:
        "The magnetic dipole moment expressed using the magnetic flux-length convention. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentMagneticDipoleMoment
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentMagneticDipoleMoment
                .propertyTypeId,
            },
            [systemPropertyTypes.yComponentMagneticDipoleMoment
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentMagneticDipoleMoment
                .propertyTypeId,
            },
            [systemPropertyTypes.zComponentMagneticDipoleMoment
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentMagneticDipoleMoment
                .propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentMagneticDipoleMoment
              .propertyTypeBaseUrl,
            systemPropertyTypes.yComponentMagneticDipoleMoment
              .propertyTypeBaseUrl,
            systemPropertyTypes.zComponentMagneticDipoleMoment
              .propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["6-30"],
  },
  {
    definition: {
      title: "Coercivity",
      description:
        "The coercivity of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticFieldStrength.dataTypeId,
        },
      ],
    },
    isoItems: ["6-31"],
  },
  {
    definition: {
      title: "Magnetic Vector Potential",
      description:
        "The magnetic vector potential of the specified system or process in electromagnetism. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentMagneticVectorPotential
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentMagneticVectorPotential
                .propertyTypeId,
            },
            [systemPropertyTypes.yComponentMagneticVectorPotential
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentMagneticVectorPotential
                .propertyTypeId,
            },
            [systemPropertyTypes.zComponentMagneticVectorPotential
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentMagneticVectorPotential
                .propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentMagneticVectorPotential
              .propertyTypeBaseUrl,
            systemPropertyTypes.yComponentMagneticVectorPotential
              .propertyTypeBaseUrl,
            systemPropertyTypes.zComponentMagneticVectorPotential
              .propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["6-32"],
  },
  {
    definition: {
      title: "Electromagnetic Energy Density",
      description:
        "The electromagnetic energy density of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energyDensity.dataTypeId,
        },
      ],
    },
    isoItems: ["6-33"],
  },
  {
    definition: {
      title: "Poynting Vector",
      description:
        "The Poynting vector of the specified system or process in electromagnetism. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentHeatFluxDensity.propertyTypeBaseUrl]:
              {
                $ref: systemPropertyTypes.xComponentHeatFluxDensity
                  .propertyTypeId,
              },
            [systemPropertyTypes.yComponentHeatFluxDensity.propertyTypeBaseUrl]:
              {
                $ref: systemPropertyTypes.yComponentHeatFluxDensity
                  .propertyTypeId,
              },
            [systemPropertyTypes.zComponentHeatFluxDensity.propertyTypeBaseUrl]:
              {
                $ref: systemPropertyTypes.zComponentHeatFluxDensity
                  .propertyTypeId,
              },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentHeatFluxDensity.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentHeatFluxDensity.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentHeatFluxDensity.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["6-34"],
  },
  {
    definition: {
      title: "Phase Speed of Electromagnetic Waves",
      description:
        "The phase speed of electromagnetic waves of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.speed.dataTypeId,
        },
      ],
    },
    isoItems: ["6-35.1"],
  },
  {
    definition: {
      title: "Speed of Light in Vacuum",
      description:
        "The speed of light in vacuum of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.speed.dataTypeId,
        },
      ],
    },
    isoItems: ["6-35.2"],
  },
  {
    definition: {
      title: "Source Voltage",
      description:
        "The source voltage of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricPotentialDifference.dataTypeId,
        },
      ],
    },
    isoItems: ["6-36"],
  },
  {
    definition: {
      title: "Magnetic Potential",
      description:
        "The magnetic potential of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricCurrent.dataTypeId,
        },
      ],
    },
    isoItems: ["6-37.1"],
  },
  {
    definition: {
      title: "Magnetic Tension",
      description:
        "The magnetic tension of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricCurrent.dataTypeId,
        },
      ],
    },
    isoItems: ["6-37.2"],
  },
  {
    definition: {
      title: "Magnetomotive Force",
      description:
        "The magnetomotive force of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricCurrent.dataTypeId,
        },
      ],
    },
    isoItems: ["6-37.3"],
  },
  {
    definition: {
      title: "Number of Turns in a Winding",
      description:
        "The number of turns in a winding of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.nonNegativeInteger.dataTypeId,
        },
      ],
    },
    isoItems: ["6-38"],
  },
  {
    definition: {
      title: "Reluctance",
      description:
        "The reluctance of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.magneticReluctance.dataTypeId,
        },
      ],
    },
    isoItems: ["6-39"],
  },
  {
    definition: {
      title: "Permeance",
      description:
        "The permeance of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.inductance.dataTypeId,
        },
      ],
    },
    isoItems: ["6-40"],
  },
  {
    definition: {
      title: "Inductance",
      description:
        "The inductance of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.inductance.dataTypeId,
        },
      ],
    },
    isoItems: ["6-41.1"],
  },
  {
    definition: {
      title: "Mutual Inductance",
      description:
        "The mutual inductance of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.inductance.dataTypeId,
        },
      ],
    },
    isoItems: ["6-41.2"],
  },
  {
    definition: {
      title: "Coupling Factor",
      description:
        "The coupling factor of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["6-42.1"],
  },
  {
    definition: {
      title: "Leakage Factor",
      description:
        "The leakage factor of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["6-42.2"],
  },
  {
    definition: {
      title: "Electric Conductivity",
      description:
        "The conductivity of the specified system or process in electromagnetism. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricConductivity.dataTypeId,
        },
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xxComponentElectricConductivity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xxComponentElectricConductivity
                .propertyTypeId,
            },
            [systemPropertyTypes.xyComponentElectricConductivity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xyComponentElectricConductivity
                .propertyTypeId,
            },
            [systemPropertyTypes.xzComponentElectricConductivity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xzComponentElectricConductivity
                .propertyTypeId,
            },
            [systemPropertyTypes.yxComponentElectricConductivity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yxComponentElectricConductivity
                .propertyTypeId,
            },
            [systemPropertyTypes.yyComponentElectricConductivity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yyComponentElectricConductivity
                .propertyTypeId,
            },
            [systemPropertyTypes.yzComponentElectricConductivity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yzComponentElectricConductivity
                .propertyTypeId,
            },
            [systemPropertyTypes.zxComponentElectricConductivity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zxComponentElectricConductivity
                .propertyTypeId,
            },
            [systemPropertyTypes.zyComponentElectricConductivity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zyComponentElectricConductivity
                .propertyTypeId,
            },
            [systemPropertyTypes.zzComponentElectricConductivity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zzComponentElectricConductivity
                .propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xxComponentElectricConductivity
              .propertyTypeBaseUrl,
            systemPropertyTypes.xyComponentElectricConductivity
              .propertyTypeBaseUrl,
            systemPropertyTypes.xzComponentElectricConductivity
              .propertyTypeBaseUrl,
            systemPropertyTypes.yxComponentElectricConductivity
              .propertyTypeBaseUrl,
            systemPropertyTypes.yyComponentElectricConductivity
              .propertyTypeBaseUrl,
            systemPropertyTypes.yzComponentElectricConductivity
              .propertyTypeBaseUrl,
            systemPropertyTypes.zxComponentElectricConductivity
              .propertyTypeBaseUrl,
            systemPropertyTypes.zyComponentElectricConductivity
              .propertyTypeBaseUrl,
            systemPropertyTypes.zzComponentElectricConductivity
              .propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["6-43"],
  },
  {
    definition: {
      title: "Electric Resistivity",
      description:
        "The resistivity of the specified system or process in electromagnetism. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricResistivity.dataTypeId,
        },
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xxComponentElectricResistivity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xxComponentElectricResistivity
                .propertyTypeId,
            },
            [systemPropertyTypes.xyComponentElectricResistivity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xyComponentElectricResistivity
                .propertyTypeId,
            },
            [systemPropertyTypes.xzComponentElectricResistivity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xzComponentElectricResistivity
                .propertyTypeId,
            },
            [systemPropertyTypes.yxComponentElectricResistivity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yxComponentElectricResistivity
                .propertyTypeId,
            },
            [systemPropertyTypes.yyComponentElectricResistivity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yyComponentElectricResistivity
                .propertyTypeId,
            },
            [systemPropertyTypes.yzComponentElectricResistivity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yzComponentElectricResistivity
                .propertyTypeId,
            },
            [systemPropertyTypes.zxComponentElectricResistivity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zxComponentElectricResistivity
                .propertyTypeId,
            },
            [systemPropertyTypes.zyComponentElectricResistivity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zyComponentElectricResistivity
                .propertyTypeId,
            },
            [systemPropertyTypes.zzComponentElectricResistivity
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zzComponentElectricResistivity
                .propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xxComponentElectricResistivity
              .propertyTypeBaseUrl,
            systemPropertyTypes.xyComponentElectricResistivity
              .propertyTypeBaseUrl,
            systemPropertyTypes.xzComponentElectricResistivity
              .propertyTypeBaseUrl,
            systemPropertyTypes.yxComponentElectricResistivity
              .propertyTypeBaseUrl,
            systemPropertyTypes.yyComponentElectricResistivity
              .propertyTypeBaseUrl,
            systemPropertyTypes.yzComponentElectricResistivity
              .propertyTypeBaseUrl,
            systemPropertyTypes.zxComponentElectricResistivity
              .propertyTypeBaseUrl,
            systemPropertyTypes.zyComponentElectricResistivity
              .propertyTypeBaseUrl,
            systemPropertyTypes.zzComponentElectricResistivity
              .propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["6-44"],
  },
  {
    definition: {
      title: "Electric Resistance",
      description:
        "The resistance of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricResistance.dataTypeId,
        },
      ],
    },
    isoItems: ["6-46", "6-51.3"],
  },
  {
    definition: {
      title: "Electric Conductance",
      description:
        "The conductance of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricConductance.dataTypeId,
        },
      ],
    },
    isoItems: ["6-47", "6-52.3"],
  },
  {
    definition: {
      title: "Phase Difference",
      description:
        "The phase difference of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.angle.dataTypeId,
        },
      ],
    },
    isoItems: ["6-48"],
  },
  {
    definition: {
      title: "Electric Current Phasor",
      description:
        "The electric current phasor of the specified system or process in electromagnetism. The real and imaginary components use the same unit family.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.realPartElectricCurrent.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.realPartElectricCurrent.propertyTypeId,
            },
            [systemPropertyTypes.imaginaryPartElectricCurrent
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.imaginaryPartElectricCurrent
                .propertyTypeId,
            },
            [systemPropertyTypes.phasorConvention.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.phasorConvention.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.realPartElectricCurrent.propertyTypeBaseUrl,
            systemPropertyTypes.imaginaryPartElectricCurrent
              .propertyTypeBaseUrl,
            systemPropertyTypes.phasorConvention.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["6-49"],
  },
  {
    definition: {
      title: "Voltage Phasor",
      description:
        "The voltage phasor of the specified system or process in electromagnetism. The real and imaginary components use the same unit family.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.realPartElectricPotentialDifference
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.realPartElectricPotentialDifference
                .propertyTypeId,
            },
            [systemPropertyTypes.imaginaryPartElectricPotentialDifference
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.imaginaryPartElectricPotentialDifference
                .propertyTypeId,
            },
            [systemPropertyTypes.phasorConvention.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.phasorConvention.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.realPartElectricPotentialDifference
              .propertyTypeBaseUrl,
            systemPropertyTypes.imaginaryPartElectricPotentialDifference
              .propertyTypeBaseUrl,
            systemPropertyTypes.phasorConvention.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["6-50"],
  },
  {
    definition: {
      title: "Impedance",
      description:
        "The impedance of the specified system or process in electromagnetism. The real and imaginary components use the same unit family.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.realPartElectricResistance
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.realPartElectricResistance
                .propertyTypeId,
            },
            [systemPropertyTypes.imaginaryPartElectricResistance
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.imaginaryPartElectricResistance
                .propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.realPartElectricResistance.propertyTypeBaseUrl,
            systemPropertyTypes.imaginaryPartElectricResistance
              .propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["6-51.1"],
  },
  {
    definition: {
      title: "Impedance of Vacuum",
      description:
        "The impedance of vacuum of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricResistance.dataTypeId,
        },
      ],
    },
    isoItems: ["6-51.2"],
  },
  {
    definition: {
      title: "Reactance",
      description:
        "The reactance of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricResistance.dataTypeId,
        },
      ],
    },
    isoItems: ["6-51.4"],
  },
  {
    definition: {
      title: "Apparent Impedance",
      description:
        "The apparent impedance of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricResistance.dataTypeId,
        },
      ],
    },
    isoItems: ["6-51.5"],
  },
  {
    definition: {
      title: "Admittance",
      description:
        "The admittance of the specified system or process in electromagnetism. The real and imaginary components use the same unit family.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.realPartElectricConductance
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.realPartElectricConductance
                .propertyTypeId,
            },
            [systemPropertyTypes.imaginaryPartElectricConductance
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.imaginaryPartElectricConductance
                .propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.realPartElectricConductance.propertyTypeBaseUrl,
            systemPropertyTypes.imaginaryPartElectricConductance
              .propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["6-52.1"],
  },
  {
    definition: {
      title: "Admittance of Vacuum",
      description:
        "The admittance of vacuum of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricConductance.dataTypeId,
        },
      ],
    },
    isoItems: ["6-52.2"],
  },
  {
    definition: {
      title: "Susceptance",
      description:
        "The susceptance of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricConductance.dataTypeId,
        },
      ],
    },
    isoItems: ["6-52.4"],
  },
  {
    definition: {
      title: "Apparent Admittance",
      description:
        "The apparent admittance of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.electricConductance.dataTypeId,
        },
      ],
    },
    isoItems: ["6-52.5"],
  },
  {
    definition: {
      title: "Electrical Quality Factor",
      description:
        "The quality factor of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["6-53"],
  },
  {
    definition: {
      title: "Loss Factor",
      description:
        "The loss factor of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["6-54"],
  },
  {
    definition: {
      title: "Loss Angle",
      description:
        "The loss angle of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.angle.dataTypeId,
        },
      ],
    },
    isoItems: ["6-55"],
  },
  {
    definition: {
      title: "Active Power",
      description:
        "The active power of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.power.dataTypeId,
        },
      ],
    },
    isoItems: ["6-56"],
  },
  {
    definition: {
      title: "Apparent Power",
      description:
        "The product of RMS voltage and RMS current; it is not generally equal to active power.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.apparentPower.dataTypeId,
        },
      ],
    },
    isoItems: ["6-57"],
  },
  {
    definition: {
      title: "Power Factor",
      description:
        "The ratio of active power to apparent power under the stated sign convention.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["6-58"],
  },
  {
    definition: {
      title: "Complex Power",
      description:
        "AC power represented by active and reactive components; real and imaginary parts are expressed in volt amperes. The real and imaginary components use the same unit family.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.realPartApparentPower.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.realPartApparentPower.propertyTypeId,
            },
            [systemPropertyTypes.imaginaryPartApparentPower
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.imaginaryPartApparentPower
                .propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.realPartApparentPower.propertyTypeBaseUrl,
            systemPropertyTypes.imaginaryPartApparentPower.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["6-59"],
  },
  {
    definition: {
      title: "Reactive Power",
      description: "The signed reactive component of AC complex power.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.reactivePower.dataTypeId,
        },
      ],
    },
    isoItems: ["6-60"],
  },
  {
    definition: {
      title: "Non-active Power",
      description:
        "The non-active power of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.apparentPower.dataTypeId,
        },
      ],
    },
    isoItems: ["6-61"],
  },
  {
    definition: {
      title: "Active Energy",
      description:
        "The active energy of the specified system or process in electromagnetism.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["6-62"],
  },
];

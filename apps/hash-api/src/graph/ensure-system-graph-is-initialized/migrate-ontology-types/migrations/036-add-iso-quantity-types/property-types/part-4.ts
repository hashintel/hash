import {
  systemDataTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { IsoPropertyType } from "../property-types";

export const part4PropertyTypes: IsoPropertyType[] = [
  {
    definition: {
      title: "Mass",
      description: "The inertial mass of an object or system.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.mass.dataTypeId,
        },
      ],
    },
    isoItems: ["4-1"],
  },
  {
    definition: {
      title: "Mass Density",
      description: "Mass divided by volume.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.massDensity.dataTypeId,
        },
      ],
    },
    isoItems: ["4-2"],
  },
  {
    definition: {
      title: "Specific Volume",
      description: "Volume divided by mass.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.specificVolume.dataTypeId,
        },
      ],
    },
    isoItems: ["4-3"],
  },
  {
    definition: {
      title: "Relative Mass Density",
      description:
        "The relative mass density of the specified system or process in mechanics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["4-4"],
  },
  {
    definition: {
      title: "Surface Mass Density",
      description: "Mass per unit surface area.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.surfaceDensity.dataTypeId,
        },
      ],
    },
    isoItems: ["4-5"],
  },
  {
    definition: {
      title: "Linear Mass Density",
      description: "Mass per unit length.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.linearMassDensity.dataTypeId,
        },
      ],
    },
    isoItems: ["4-6"],
  },
  {
    definition: {
      title: "Moment of Inertia",
      description:
        "The inertia for rotation about an axis, or its second-order tensor in a stated frame. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.momentOfInertia.dataTypeId,
        },
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xxComponentMomentOfInertia
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xxComponentMomentOfInertia
                .propertyTypeId,
            },
            [systemPropertyTypes.xyComponentMomentOfInertia
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xyComponentMomentOfInertia
                .propertyTypeId,
            },
            [systemPropertyTypes.xzComponentMomentOfInertia
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xzComponentMomentOfInertia
                .propertyTypeId,
            },
            [systemPropertyTypes.yxComponentMomentOfInertia
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yxComponentMomentOfInertia
                .propertyTypeId,
            },
            [systemPropertyTypes.yyComponentMomentOfInertia
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yyComponentMomentOfInertia
                .propertyTypeId,
            },
            [systemPropertyTypes.yzComponentMomentOfInertia
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yzComponentMomentOfInertia
                .propertyTypeId,
            },
            [systemPropertyTypes.zxComponentMomentOfInertia
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zxComponentMomentOfInertia
                .propertyTypeId,
            },
            [systemPropertyTypes.zyComponentMomentOfInertia
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zyComponentMomentOfInertia
                .propertyTypeId,
            },
            [systemPropertyTypes.zzComponentMomentOfInertia
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zzComponentMomentOfInertia
                .propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xxComponentMomentOfInertia.propertyTypeBaseUrl,
            systemPropertyTypes.xyComponentMomentOfInertia.propertyTypeBaseUrl,
            systemPropertyTypes.xzComponentMomentOfInertia.propertyTypeBaseUrl,
            systemPropertyTypes.yxComponentMomentOfInertia.propertyTypeBaseUrl,
            systemPropertyTypes.yyComponentMomentOfInertia.propertyTypeBaseUrl,
            systemPropertyTypes.yzComponentMomentOfInertia.propertyTypeBaseUrl,
            systemPropertyTypes.zxComponentMomentOfInertia.propertyTypeBaseUrl,
            systemPropertyTypes.zyComponentMomentOfInertia.propertyTypeBaseUrl,
            systemPropertyTypes.zzComponentMomentOfInertia.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["4-7"],
  },
  {
    definition: {
      title: "Momentum",
      description:
        "The linear momentum of an object or system. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentMomentum.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentMomentum.propertyTypeId,
            },
            [systemPropertyTypes.yComponentMomentum.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentMomentum.propertyTypeId,
            },
            [systemPropertyTypes.zComponentMomentum.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentMomentum.propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentMomentum.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentMomentum.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentMomentum.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["4-8"],
  },
  {
    definition: {
      title: "Force",
      description:
        "The interaction represented by the rate of change of momentum. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentForce.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentForce.propertyTypeId,
            },
            [systemPropertyTypes.yComponentForce.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentForce.propertyTypeId,
            },
            [systemPropertyTypes.zComponentForce.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentForce.propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentForce.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentForce.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentForce.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["4-9.1"],
  },
  {
    definition: {
      title: "Weight",
      description:
        "The gravitational force acting on an object. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentForce.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentForce.propertyTypeId,
            },
            [systemPropertyTypes.yComponentForce.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentForce.propertyTypeId,
            },
            [systemPropertyTypes.zComponentForce.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentForce.propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentForce.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentForce.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentForce.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["4-9.2"],
  },
  {
    definition: {
      title: "Static Friction Force",
      description:
        "The static friction force of the specified system or process in mechanics. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentForce.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentForce.propertyTypeId,
            },
            [systemPropertyTypes.yComponentForce.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentForce.propertyTypeId,
            },
            [systemPropertyTypes.zComponentForce.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentForce.propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentForce.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentForce.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentForce.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["4-9.3"],
  },
  {
    definition: {
      title: "Kinetic Friction Force",
      description:
        "The kinetic friction force of the specified system or process in mechanics. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentForce.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentForce.propertyTypeId,
            },
            [systemPropertyTypes.yComponentForce.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentForce.propertyTypeId,
            },
            [systemPropertyTypes.zComponentForce.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentForce.propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentForce.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentForce.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentForce.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["4-9.4"],
  },
  {
    definition: {
      title: "Rolling Resistance",
      description:
        "The rolling resistance of the specified system or process in mechanics. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentForce.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentForce.propertyTypeId,
            },
            [systemPropertyTypes.yComponentForce.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentForce.propertyTypeId,
            },
            [systemPropertyTypes.zComponentForce.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentForce.propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentForce.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentForce.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentForce.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["4-9.5"],
  },
  {
    definition: {
      title: "Drag Force",
      description:
        "The drag force of the specified system or process in mechanics. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentForce.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentForce.propertyTypeId,
            },
            [systemPropertyTypes.yComponentForce.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentForce.propertyTypeId,
            },
            [systemPropertyTypes.zComponentForce.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentForce.propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentForce.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentForce.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentForce.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["4-9.6"],
  },
  {
    definition: {
      title: "Impulse",
      description:
        "Force integrated over a time interval. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentImpulse.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentImpulse.propertyTypeId,
            },
            [systemPropertyTypes.yComponentImpulse.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentImpulse.propertyTypeId,
            },
            [systemPropertyTypes.zComponentImpulse.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentImpulse.propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentImpulse.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentImpulse.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentImpulse.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["4-10"],
  },
  {
    definition: {
      title: "Angular Momentum",
      description:
        "The angular momentum of the specified system or process in mechanics. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentAngularMomentum.propertyTypeBaseUrl]:
              {
                $ref: systemPropertyTypes.xComponentAngularMomentum
                  .propertyTypeId,
              },
            [systemPropertyTypes.yComponentAngularMomentum.propertyTypeBaseUrl]:
              {
                $ref: systemPropertyTypes.yComponentAngularMomentum
                  .propertyTypeId,
              },
            [systemPropertyTypes.zComponentAngularMomentum.propertyTypeBaseUrl]:
              {
                $ref: systemPropertyTypes.zComponentAngularMomentum
                  .propertyTypeId,
              },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentAngularMomentum.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentAngularMomentum.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentAngularMomentum.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["4-11"],
  },
  {
    definition: {
      title: "Moment of Force",
      description:
        "The moment of force of the specified system or process in mechanics. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentTorque.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentTorque.propertyTypeId,
            },
            [systemPropertyTypes.yComponentTorque.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentTorque.propertyTypeId,
            },
            [systemPropertyTypes.zComponentTorque.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentTorque.propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentTorque.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentTorque.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentTorque.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["4-12.1"],
  },
  {
    definition: {
      title: "Torque",
      description:
        "The moment of a force about a specified origin or axis. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentTorque.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentTorque.propertyTypeId,
            },
            [systemPropertyTypes.yComponentTorque.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentTorque.propertyTypeId,
            },
            [systemPropertyTypes.zComponentTorque.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentTorque.propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentTorque.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentTorque.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentTorque.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["4-12.2"],
  },
  {
    definition: {
      title: "Angular Impulse",
      description:
        "The angular impulse of the specified system or process in mechanics. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentAngularImpulse.propertyTypeBaseUrl]:
              {
                $ref: systemPropertyTypes.xComponentAngularImpulse
                  .propertyTypeId,
              },
            [systemPropertyTypes.yComponentAngularImpulse.propertyTypeBaseUrl]:
              {
                $ref: systemPropertyTypes.yComponentAngularImpulse
                  .propertyTypeId,
              },
            [systemPropertyTypes.zComponentAngularImpulse.propertyTypeBaseUrl]:
              {
                $ref: systemPropertyTypes.zComponentAngularImpulse
                  .propertyTypeId,
              },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentAngularImpulse.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentAngularImpulse.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentAngularImpulse.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["4-13"],
  },
  {
    definition: {
      title: "Pressure",
      description: "The compressive normal force per unit area.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.pressure.dataTypeId,
        },
      ],
    },
    isoItems: ["4-14.1"],
  },
  {
    definition: {
      title: "Gauge Pressure",
      description:
        "Pressure relative to a stated reference pressure, usually ambient atmospheric pressure.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.pressure.dataTypeId,
        },
      ],
    },
    isoItems: ["4-14.2"],
  },
  {
    definition: {
      title: "Stress",
      description:
        "The force per unit area represented as a second-order tensor. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xxComponentPressure.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xxComponentPressure.propertyTypeId,
            },
            [systemPropertyTypes.xyComponentPressure.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xyComponentPressure.propertyTypeId,
            },
            [systemPropertyTypes.xzComponentPressure.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xzComponentPressure.propertyTypeId,
            },
            [systemPropertyTypes.yxComponentPressure.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yxComponentPressure.propertyTypeId,
            },
            [systemPropertyTypes.yyComponentPressure.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yyComponentPressure.propertyTypeId,
            },
            [systemPropertyTypes.yzComponentPressure.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yzComponentPressure.propertyTypeId,
            },
            [systemPropertyTypes.zxComponentPressure.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zxComponentPressure.propertyTypeId,
            },
            [systemPropertyTypes.zyComponentPressure.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zyComponentPressure.propertyTypeId,
            },
            [systemPropertyTypes.zzComponentPressure.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zzComponentPressure.propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xxComponentPressure.propertyTypeBaseUrl,
            systemPropertyTypes.xyComponentPressure.propertyTypeBaseUrl,
            systemPropertyTypes.xzComponentPressure.propertyTypeBaseUrl,
            systemPropertyTypes.yxComponentPressure.propertyTypeBaseUrl,
            systemPropertyTypes.yyComponentPressure.propertyTypeBaseUrl,
            systemPropertyTypes.yzComponentPressure.propertyTypeBaseUrl,
            systemPropertyTypes.zxComponentPressure.propertyTypeBaseUrl,
            systemPropertyTypes.zyComponentPressure.propertyTypeBaseUrl,
            systemPropertyTypes.zzComponentPressure.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["4-15"],
  },
  {
    definition: {
      title: "Normal Stress",
      description: "The normal component of stress on a specified plane.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.pressure.dataTypeId,
        },
      ],
    },
    isoItems: ["4-16.1"],
  },
  {
    definition: {
      title: "Shear Stress",
      description: "The tangential component of stress on a specified plane.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.pressure.dataTypeId,
        },
      ],
    },
    isoItems: ["4-16.2"],
  },
  {
    definition: {
      title: "Strain",
      description:
        "The dimensionless deformation represented as a second-order tensor. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
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
    isoItems: ["4-17.1"],
  },
  {
    definition: {
      title: "Relative Linear Strain",
      description:
        "The relative linear strain of the specified system or process in mechanics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["4-17.2"],
  },
  {
    definition: {
      title: "Shear Strain",
      description:
        "The shear strain of the specified system or process in mechanics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["4-17.3"],
  },
  {
    definition: {
      title: "Relative Volume Strain",
      description:
        "The relative volume strain of the specified system or process in mechanics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["4-17.4"],
  },
  {
    definition: {
      title: "Poisson Ratio",
      description:
        "The negative ratio of transverse to axial strain under uniaxial loading.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["4-18"],
  },
  {
    definition: {
      title: "Young Modulus",
      description:
        "The modulus of elasticity of the specified system or process in mechanics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.pressure.dataTypeId,
        },
      ],
    },
    isoItems: ["4-19.1"],
  },
  {
    definition: {
      title: "Shear Modulus",
      description:
        "The modulus of rigidity of the specified system or process in mechanics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.pressure.dataTypeId,
        },
      ],
    },
    isoItems: ["4-19.2"],
  },
  {
    definition: {
      title: "Bulk Modulus",
      description:
        "The modulus of compression of the specified system or process in mechanics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.pressure.dataTypeId,
        },
      ],
    },
    isoItems: ["4-19.3"],
  },
  {
    definition: {
      title: "Compressibility",
      description:
        "The compressibility of the specified system or process in mechanics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.reciprocalPressure.dataTypeId,
        },
      ],
    },
    isoItems: ["4-20"],
  },
  {
    definition: {
      title: "Second Axial Moment of Area",
      description:
        "The second axial moment of area of the specified system or process in mechanics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.fourthPowerOfLength.dataTypeId,
        },
      ],
    },
    isoItems: ["4-21.1"],
  },
  {
    definition: {
      title: "Second Polar Moment of Area",
      description:
        "The second polar moment of area of the specified system or process in mechanics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.fourthPowerOfLength.dataTypeId,
        },
      ],
    },
    isoItems: ["4-21.2"],
  },
  {
    definition: {
      title: "Section Modulus",
      description:
        "The section modulus of the specified system or process in mechanics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.volume.dataTypeId,
        },
      ],
    },
    isoItems: ["4-22"],
  },
  {
    definition: {
      title: "Static Friction Factor",
      description:
        "The static friction factor of the specified system or process in mechanics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["4-23.1"],
  },
  {
    definition: {
      title: "Kinetic Friction Factor",
      description:
        "The kinetic friction factor of the specified system or process in mechanics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["4-23.2"],
  },
  {
    definition: {
      title: "Rolling Resistance Factor",
      description:
        "The rolling resistance factor of the specified system or process in mechanics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["4-23.3"],
  },
  {
    definition: {
      title: "Drag Coefficient",
      description:
        "The drag coefficient of the specified system or process in mechanics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["4-23.4", "11-4.9"],
  },
  {
    definition: {
      title: "Dynamic Viscosity",
      description:
        "The proportionality between shear stress and velocity gradient for the stated fluid and conditions.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dynamicViscosity.dataTypeId,
        },
      ],
    },
    isoItems: ["4-24"],
  },
  {
    definition: {
      title: "Kinematic Viscosity",
      description: "Dynamic viscosity divided by mass density.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.kinematicViscosity.dataTypeId,
        },
      ],
    },
    isoItems: ["4-25"],
  },
  {
    definition: {
      title: "Surface Tension",
      description:
        "The surface tension of the specified system or process in mechanics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.surfaceTension.dataTypeId,
        },
      ],
    },
    isoItems: ["4-26"],
  },
  {
    definition: {
      title: "Power",
      description: "The rate of energy transfer or work.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.power.dataTypeId,
        },
      ],
    },
    isoItems: ["4-27", "6-45"],
  },
  {
    definition: {
      title: "Potential Energy",
      description:
        "The potential energy of the specified system or process in mechanics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["4-28.1"],
  },
  {
    definition: {
      title: "Kinetic Energy",
      description:
        "The kinetic energy of the specified system or process in mechanics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["4-28.2"],
  },
  {
    definition: {
      title: "Mechanical Energy",
      description:
        "The mechanical energy of the specified system or process in mechanics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["4-28.3"],
  },
  {
    definition: {
      title: "Mechanical Work",
      description:
        "The mechanical work of the specified system or process in mechanics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["4-28.4"],
  },
  {
    definition: {
      title: "Efficiency",
      description:
        "The efficiency of the specified system or process in mechanics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["4-29"],
  },
  {
    definition: {
      title: "Mass Flux Density",
      description:
        "The mass flow of the specified system or process in mechanics. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentMassFluxDensity.propertyTypeBaseUrl]:
              {
                $ref: systemPropertyTypes.xComponentMassFluxDensity
                  .propertyTypeId,
              },
            [systemPropertyTypes.yComponentMassFluxDensity.propertyTypeBaseUrl]:
              {
                $ref: systemPropertyTypes.yComponentMassFluxDensity
                  .propertyTypeId,
              },
            [systemPropertyTypes.zComponentMassFluxDensity.propertyTypeBaseUrl]:
              {
                $ref: systemPropertyTypes.zComponentMassFluxDensity
                  .propertyTypeId,
              },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentMassFluxDensity.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentMassFluxDensity.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentMassFluxDensity.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["4-30.1"],
  },
  {
    definition: {
      title: "Mass Flow Rate",
      description:
        "The mass passing through a specified surface per unit time.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.massFlowRate.dataTypeId,
        },
      ],
    },
    isoItems: ["4-30.2"],
  },
  {
    definition: {
      title: "Mass Change Rate",
      description:
        "The mass change rate of the specified system or process in mechanics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.massFlowRate.dataTypeId,
        },
      ],
    },
    isoItems: ["4-30.3"],
  },
  {
    definition: {
      title: "Volume Flow Rate",
      description:
        "The volume passing through a specified surface per unit time.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.volumeFlowRate.dataTypeId,
        },
      ],
    },
    isoItems: ["4-31"],
  },
  {
    definition: {
      title: "Action",
      description:
        "The action of the specified system or process in mechanics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.action.dataTypeId,
        },
      ],
    },
    isoItems: ["4-32"],
  },
];

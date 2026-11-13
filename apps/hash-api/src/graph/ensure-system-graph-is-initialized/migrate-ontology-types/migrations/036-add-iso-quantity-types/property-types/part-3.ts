import {
  systemDataTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { IsoPropertyType } from "../property-types";

export const part3PropertyTypes: IsoPropertyType[] = [
  {
    definition: {
      title: "Length",
      description: "The extent measured along a line or curve.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: ["3-1.1"],
  },
  {
    definition: {
      title: "Width",
      description:
        "The extent across an object, perpendicular to its chosen length direction.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: ["3-1.2"],
  },
  {
    definition: {
      title: "Height",
      description:
        "The vertical extent of an object relative to the stated reference direction.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: ["3-1.3"],
  },
  {
    definition: {
      title: "Thickness",
      description:
        "The distance between the opposed faces of a layer or object.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: ["3-1.4"],
  },
  {
    definition: {
      title: "Diameter",
      description: "The distance across a circle or sphere through its center.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: ["3-1.5"],
  },
  {
    definition: {
      title: "Radius",
      description:
        "The distance from the center of a circle or sphere to its boundary.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: ["3-1.6"],
  },
  {
    definition: {
      title: "Path Length",
      description: "The distance traveled along a specified path.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: ["3-1.7"],
  },
  {
    definition: {
      title: "Distance",
      description: "The separation between two specified points.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: ["3-1.8"],
  },
  {
    definition: {
      title: "Radial Distance",
      description: "The distance from a specified reference point.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: ["3-1.9"],
  },
  {
    definition: {
      title: "Position Vector",
      description:
        "The vector from the reference frame origin to a point. Components use the stated right-handed orthonormal Cartesian reference frame.",
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
    isoItems: ["3-1.10"],
  },
  {
    definition: {
      title: "Displacement",
      description:
        "The change in position between two points in a shared reference frame. Components use the stated right-handed orthonormal Cartesian reference frame.",
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
    isoItems: ["3-1.11"],
  },
  {
    definition: {
      title: "Radius of Curvature",
      description:
        "The radius of curvature of the specified system or process in space and time.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: ["3-1.12"],
  },
  {
    definition: {
      title: "Curvature",
      description: "The reciprocal of the local radius of curvature.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.wavenumber.dataTypeId,
        },
      ],
    },
    isoItems: ["3-2"],
  },
  {
    definition: {
      title: "Wavenumber",
      description:
        "The reciprocal of wavelength, expressed in cycles per unit length.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.wavenumber.dataTypeId,
        },
      ],
    },
    isoItems: ["3-20"],
  },
  {
    definition: {
      title: "Wave Vector",
      description:
        "The wave vector of the specified system or process in space and time. Components use the stated right-handed orthonormal Cartesian reference frame.",
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
    isoItems: ["3-21"],
  },
  {
    definition: {
      title: "Angular Wavenumber",
      description:
        "The spatial rate of change of phase angle; equal to 2π divided by wavelength.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.angularWavenumber.dataTypeId,
        },
      ],
    },
    isoItems: ["3-22", "12-9.1"],
  },
  {
    definition: {
      title: "Attenuation Coefficient",
      description:
        "The attenuation of the specified system or process in space and time.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.wavenumber.dataTypeId,
        },
      ],
    },
    isoItems: ["3-26.1"],
  },
  {
    definition: {
      title: "Phase Coefficient",
      description:
        "The phase coefficient of the specified system or process in space and time.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.angularWavenumber.dataTypeId,
        },
      ],
    },
    isoItems: ["3-26.2"],
  },
  {
    definition: {
      title: "Propagation Coefficient",
      description:
        "The propagation coefficient of the specified system or process in space and time. The real and imaginary components use the same unit family.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.realPartWavenumber.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.realPartWavenumber.propertyTypeId,
            },
            [systemPropertyTypes.imaginaryPartWavenumber.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.imaginaryPartWavenumber.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.realPartWavenumber.propertyTypeBaseUrl,
            systemPropertyTypes.imaginaryPartWavenumber.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["3-26.3"],
  },
  {
    definition: {
      title: "Area",
      description:
        "The area of the specified system or process in space and time.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.area.dataTypeId,
        },
      ],
    },
    isoItems: ["3-3"],
  },
  {
    definition: {
      title: "Volume",
      description:
        "The volume of the specified system or process in space and time.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.volume.dataTypeId,
        },
      ],
    },
    isoItems: ["3-4"],
  },
  {
    definition: {
      title: "Plane Angle",
      description:
        "The plane angle of the specified system or process in space and time.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.angle.dataTypeId,
        },
      ],
    },
    isoItems: ["3-5"],
  },
  {
    definition: {
      title: "Rotational Displacement",
      description:
        "The rotational displacement of the specified system or process in space and time. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentAngle.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentAngle.propertyTypeId,
            },
            [systemPropertyTypes.yComponentAngle.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentAngle.propertyTypeId,
            },
            [systemPropertyTypes.zComponentAngle.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentAngle.propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentAngle.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentAngle.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentAngle.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["3-6"],
  },
  {
    definition: {
      title: "Phase Angle",
      description:
        "The phase angle of the specified system or process in space and time.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.angle.dataTypeId,
        },
      ],
    },
    isoItems: ["3-7"],
  },
  {
    definition: {
      title: "Solid Angle",
      description:
        "The solid angle of the specified system or process in space and time.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.solidAngle.dataTypeId,
        },
      ],
    },
    isoItems: ["3-8"],
  },
  {
    definition: {
      title: "Rotation",
      description:
        "The rotation of the specified system or process in space and time.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.revolutions.dataTypeId,
        },
      ],
    },
    isoItems: ["3-16"],
  },
  {
    definition: {
      title: "Logarithmic Decrement",
      description:
        "The logarithmic decrement of the specified system or process in space and time.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
    },
    isoItems: ["3-25"],
  },
  {
    definition: {
      title: "Duration",
      description: "The elapsed time between two events.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.duration.dataTypeId,
        },
      ],
    },
    isoItems: ["3-9"],
  },
  {
    definition: {
      title: "Period Duration",
      description:
        "The time taken for one complete cycle of a periodic process.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.duration.dataTypeId,
        },
      ],
    },
    isoItems: ["3-14"],
  },
  {
    definition: {
      title: "Time Constant",
      description:
        "The characteristic time for an exponential response to change by a factor of e.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.duration.dataTypeId,
        },
      ],
    },
    isoItems: ["3-15"],
  },
  {
    definition: {
      title: "Frequency",
      description: "The number of cycles of a periodic process per unit time.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.frequency.dataTypeId,
        },
      ],
    },
    isoItems: ["3-17.1"],
  },
  {
    definition: {
      title: "Rotational Frequency",
      description: "The number of complete rotations per unit time.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.revolutionsPerSecond.dataTypeId,
        },
      ],
    },
    isoItems: ["3-17.2"],
  },
  {
    definition: {
      title: "Angular Frequency",
      description: "The rate of change of phase angle for a periodic process.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.angularVelocity.dataTypeId,
        },
      ],
    },
    isoItems: ["3-18"],
  },
  {
    definition: {
      title: "Angular Velocity",
      description:
        "The vector describing the rate and axis of rotation. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentAngularVelocity.propertyTypeBaseUrl]:
              {
                $ref: systemPropertyTypes.xComponentAngularVelocity
                  .propertyTypeId,
              },
            [systemPropertyTypes.yComponentAngularVelocity.propertyTypeBaseUrl]:
              {
                $ref: systemPropertyTypes.yComponentAngularVelocity
                  .propertyTypeId,
              },
            [systemPropertyTypes.zComponentAngularVelocity.propertyTypeBaseUrl]:
              {
                $ref: systemPropertyTypes.zComponentAngularVelocity
                  .propertyTypeId,
              },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentAngularVelocity.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentAngularVelocity.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentAngularVelocity.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["3-12"],
  },
  {
    definition: {
      title: "Damping Coefficient",
      description:
        "The damping coefficient of the specified system or process in space and time.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.reciprocalDuration.dataTypeId,
        },
      ],
    },
    isoItems: ["3-24"],
  },
  {
    definition: {
      title: "Velocity",
      description:
        "The rate of change of position in a stated reference frame. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentSpeed.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentSpeed.propertyTypeId,
            },
            [systemPropertyTypes.yComponentSpeed.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentSpeed.propertyTypeId,
            },
            [systemPropertyTypes.zComponentSpeed.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentSpeed.propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentSpeed.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentSpeed.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentSpeed.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["3-10.1"],
  },
  {
    definition: {
      title: "Speed",
      description: "The magnitude of velocity.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.speed.dataTypeId,
        },
      ],
    },
    isoItems: ["3-10.2"],
  },
  {
    definition: {
      title: "Phase Speed",
      description:
        "The phase velocity of the specified system or process in space and time.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.speed.dataTypeId,
        },
      ],
    },
    isoItems: ["3-23.1"],
  },
  {
    definition: {
      title: "Group Speed",
      description:
        "The group velocity of the specified system or process in space and time.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.speed.dataTypeId,
        },
      ],
    },
    isoItems: ["3-23.2"],
  },
  {
    definition: {
      title: "Acceleration",
      description:
        "The rate of change of velocity in a stated reference frame. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentAcceleration.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentAcceleration.propertyTypeId,
            },
            [systemPropertyTypes.yComponentAcceleration.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentAcceleration.propertyTypeId,
            },
            [systemPropertyTypes.zComponentAcceleration.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentAcceleration.propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentAcceleration.propertyTypeBaseUrl,
            systemPropertyTypes.yComponentAcceleration.propertyTypeBaseUrl,
            systemPropertyTypes.zComponentAcceleration.propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["3-11"],
  },
  {
    definition: {
      title: "Angular Acceleration",
      description:
        "The rate of change of angular velocity. Components use the stated right-handed orthonormal Cartesian reference frame.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.xComponentAngularAcceleration
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.xComponentAngularAcceleration
                .propertyTypeId,
            },
            [systemPropertyTypes.yComponentAngularAcceleration
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.yComponentAngularAcceleration
                .propertyTypeId,
            },
            [systemPropertyTypes.zComponentAngularAcceleration
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.zComponentAngularAcceleration
                .propertyTypeId,
            },
            [systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.cartesianReferenceFrame.propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.xComponentAngularAcceleration
              .propertyTypeBaseUrl,
            systemPropertyTypes.yComponentAngularAcceleration
              .propertyTypeBaseUrl,
            systemPropertyTypes.zComponentAngularAcceleration
              .propertyTypeBaseUrl,
            systemPropertyTypes.cartesianReferenceFrame.propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["3-13"],
  },
  {
    definition: {
      title: "Wavelength",
      description: "The spatial interval over which a periodic wave repeats.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.length.dataTypeId,
        },
      ],
    },
    isoItems: ["3-19"],
  },
];

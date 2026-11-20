import {
  systemDataTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { IsoPropertyType } from "../property-types";

export const part8PropertyTypes: IsoPropertyType[] = [
  {
    definition: {
      title: "Logarithmic Frequency Range",
      description:
        "The logarithm of the ratio between two frequencies, expressed as a frequency interval.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.logarithmicFrequencyInterval.dataTypeId,
        },
      ],
    },
    isoItems: ["8-1"],
  },
  {
    definition: {
      title: "Static Pressure",
      description:
        "The static pressure of the specified system or process in acoustics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.pressure.dataTypeId,
        },
      ],
    },
    isoItems: ["8-2.1"],
  },
  {
    definition: {
      title: "Sound Pressure",
      description:
        "The instantaneous pressure deviation from static pressure caused by a sound wave.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.pressure.dataTypeId,
        },
      ],
    },
    isoItems: ["8-2.2"],
  },
  {
    definition: {
      title: "Sound Particle Displacement",
      description:
        "The sound particle displacement of the specified system or process in acoustics. Components use the stated right-handed orthonormal Cartesian reference frame.",
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
    isoItems: ["8-3"],
  },
  {
    definition: {
      title: "Sound Particle Velocity",
      description:
        "The sound particle velocity of the specified system or process in acoustics. Components use the stated right-handed orthonormal Cartesian reference frame.",
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
    isoItems: ["8-4"],
  },
  {
    definition: {
      title: "Sound Particle Acceleration",
      description:
        "The sound particle acceleration of the specified system or process in acoustics. Components use the stated right-handed orthonormal Cartesian reference frame.",
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
    isoItems: ["8-5"],
  },
  {
    definition: {
      title: "Sound Volume Flow Rate",
      description:
        "The volume flow rate of the specified system or process in acoustics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.volumeFlowRate.dataTypeId,
        },
      ],
    },
    isoItems: ["8-6"],
  },
  {
    definition: {
      title: "Sound Energy Density",
      description:
        "The sound energy density of the specified system or process in acoustics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energyDensity.dataTypeId,
        },
      ],
    },
    isoItems: ["8-7"],
  },
  {
    definition: {
      title: "Sound Energy",
      description:
        "The sound energy of the specified system or process in acoustics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.energy.dataTypeId,
        },
      ],
    },
    isoItems: ["8-8"],
  },
  {
    definition: {
      title: "Sound Power",
      description:
        "The sound power of the specified system or process in acoustics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.power.dataTypeId,
        },
      ],
    },
    isoItems: ["8-9"],
  },
  {
    definition: {
      title: "Sound Intensity",
      description:
        "The sound intensity of the specified system or process in acoustics. Components use the stated right-handed orthonormal Cartesian reference frame.",
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
    isoItems: ["8-10"],
  },
  {
    definition: {
      title: "Sound Exposure",
      description: "The time integral of squared sound pressure.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.soundExposure.dataTypeId,
        },
      ],
    },
    isoItems: ["8-11"],
  },
  {
    definition: {
      title: "Characteristic Acoustic Impedance",
      description:
        "The characteristic impedance of a medium of the specified system or process in acoustics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.specificAcousticImpedance.dataTypeId,
        },
      ],
    },
    isoItems: ["8-12"],
  },
  {
    definition: {
      title: "Acoustic Impedance",
      description:
        "The acoustic impedance of the specified system or process in acoustics. The real and imaginary components use the same unit family.",
      possibleValues: [
        {
          propertyTypeObjectProperties: {
            [systemPropertyTypes.realPartAcousticImpedance.propertyTypeBaseUrl]:
              {
                $ref: systemPropertyTypes.realPartAcousticImpedance
                  .propertyTypeId,
              },
            [systemPropertyTypes.imaginaryPartAcousticImpedance
              .propertyTypeBaseUrl]: {
              $ref: systemPropertyTypes.imaginaryPartAcousticImpedance
                .propertyTypeId,
            },
          },
          propertyTypeObjectRequiredProperties: [
            systemPropertyTypes.realPartAcousticImpedance.propertyTypeBaseUrl,
            systemPropertyTypes.imaginaryPartAcousticImpedance
              .propertyTypeBaseUrl,
          ],
        },
      ],
    },
    isoItems: ["8-13"],
  },
  {
    definition: {
      title: "Sound Pressure Level",
      description:
        "The unweighted sound pressure level referenced to 20 micropascals.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.decibelsSoundPressure.dataTypeId,
        },
      ],
    },
    isoItems: ["8-14"],
  },
  {
    definition: {
      title: "Sound Power Level",
      description: "The sound power level referenced to one picowatt.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.decibelsSoundPower.dataTypeId,
        },
      ],
    },
    isoItems: ["8-15"],
  },
  {
    definition: {
      title: "Sound Exposure Level",
      description:
        "The sound exposure level referenced to (20 micropascals)² times one second.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.decibelsSoundExposure.dataTypeId,
        },
      ],
    },
    isoItems: ["8-16"],
  },
  {
    definition: {
      title: "Reverberation Time",
      description:
        "The reverberation time of the specified system or process in acoustics.",
      possibleValues: [
        {
          dataTypeId: systemDataTypes.duration.dataTypeId,
        },
      ],
    },
    isoItems: ["8-17"],
  },
];

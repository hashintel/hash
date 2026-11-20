import { systemDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { MeasurementPropertyType } from "../property-types";

export const lightSoundAndRadiationPropertyTypes: MeasurementPropertyType[] = [
  {
    title: "Workplane Illuminance",
    description:
      "The illuminance incident on the stated working plane at the observation location.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.illuminance.dataTypeId,
      },
    ],
  },
  {
    title: "Display Luminance",
    description:
      "The luminance emitted by a display in the stated viewing direction and test pattern.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.luminance.dataTypeId,
      },
    ],
  },
  {
    title: "Lamp Luminous Flux",
    description:
      "The total luminous flux emitted by a lamp under its stated operating conditions.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.luminousFlux.dataTypeId,
      },
    ],
  },
  {
    title: "A-weighted Equivalent Continuous Sound Pressure Level",
    description:
      "The level of a constant sound having the same time-averaged squared A-weighted sound pressure as the measured sound over the stated interval, referenced to 20 micropascals.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.decibelsAWeightedSoundPressure.dataTypeId,
      },
    ],
  },
  {
    title: "C-weighted Peak Sound Pressure Level",
    description:
      "The sound pressure level corresponding to the greatest absolute instantaneous C-weighted sound pressure in the stated observation interval, referenced to 20 micropascals.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.decibelsCWeightedSoundPressure.dataTypeId,
      },
    ],
  },
  {
    title: "Received Signal Power Level",
    description:
      "The logarithmic power level of a received signal at the stated measurement point and bandwidth, using the reference power of the selected data type.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.powerLevel.dataTypeId,
      },
    ],
  },
  {
    title: "Transmitted Signal Power Level",
    description:
      "The logarithmic power level delivered by a transmitter at the stated measurement point and bandwidth, using the reference power of the selected data type.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.powerLevel.dataTypeId,
      },
    ],
  },
  {
    title: "Surface Radioactive Contamination",
    description:
      "The radionuclide activity per unit area of a surface, with the radionuclides, measurement method, and inclusion of removable or fixed contamination stated.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.activityPerArea.dataTypeId,
      },
    ],
  },
  {
    title: "Airborne Radionuclide Activity Concentration",
    description:
      "The radionuclide activity per volume of sampled air, with the radionuclides and air-volume measurement conditions stated.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.activityPerVolume.dataTypeId,
      },
    ],
  },
  {
    title: "Material Specific Activity",
    description:
      "The radionuclide activity per mass of a material sample, with the radionuclides and sample basis stated.",
    possibleValues: [
      {
        dataTypeId: systemDataTypes.activityPerMass.dataTypeId,
      },
    ],
  },
];

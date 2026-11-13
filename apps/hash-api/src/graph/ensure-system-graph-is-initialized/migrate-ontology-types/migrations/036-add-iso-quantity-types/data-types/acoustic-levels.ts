import { systemDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { IsoDataType } from "../data-types";

export const acousticLevelsDataTypes: IsoDataType[] = [
  {
    definition: {
      title: "Decibels (Sound Power)",
      description:
        "Ten times the base-ten logarithm of sound power relative to one picowatt.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.powerLevelMetric.dataTypeId,
        },
      ],
      label: {
        right: "dB re 1 pW",
      },
    },
    conversions: {
      [systemDataTypes.decibelWatts.dataTypeBaseUrl]: {
        to: {
          expression: [
            "+",
            "self",
            {
              const: -120,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "-",
            "self",
            {
              const: -120,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Sound Exposure Level",
      description:
        "Logarithmic sound exposure values with an explicit reference.",
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
      title: "Decibels (Sound Exposure)",
      description:
        "Ten times the base-ten logarithm of sound exposure relative to 4 × 10^-10 pascal squared seconds.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.soundExposureLevel.dataTypeId,
        },
      ],
      label: {
        right: "dB re (20 μPa)²·s",
      },
    },
    conversions: {},
  },
];

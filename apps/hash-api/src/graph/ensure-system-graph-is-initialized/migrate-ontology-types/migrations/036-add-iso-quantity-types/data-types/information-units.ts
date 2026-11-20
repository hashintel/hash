import { systemDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { IsoDataType } from "../data-types";

export const informationUnitsDataTypes: IsoDataType[] = [
  {
    definition: {
      title: "Information Content",
      description: "Numeric values in units of information content.",
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
      title: "Information Rate",
      description: "Numeric values in units of information rate.",
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
      title: "Data Transfer Rate",
      description: "Numeric values in units of data transfer rate.",
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
      title: "Modulation Rate",
      description: "Numeric values in units of modulation rate.",
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
      title: "Traffic Intensity",
      description: "Numeric values in units of traffic intensity.",
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
      title: "Logarithmic Frequency Interval",
      description: "Numeric values in units of logarithmic frequency interval.",
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
      title: "Information (Binary)",
      description: "Binary storage quantities expressed using powers of two.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.information.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    definition: {
      title: "Information (Decimal)",
      description: "Binary storage quantities expressed using powers of ten.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.information.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    definition: {
      title: "Shannons",
      description:
        "A logarithmic information unit using base 2. Logarithm-base conversion factors are approximate.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationContent.dataTypeId,
        },
      ],
      label: {
        right: "Sh",
      },
    },
    conversions: {},
  },
  {
    definition: {
      title: "Shannons per Second",
      description: "A value expressed in shannons per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationRate.dataTypeId,
        },
      ],
      label: {
        right: "Sh/s",
      },
    },
    conversions: {},
  },
  {
    definition: {
      title: "Hartleys",
      description:
        "A logarithmic information unit using base 10. Logarithm-base conversion factors are approximate.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationContent.dataTypeId,
        },
      ],
      label: {
        right: "Hart",
      },
    },
    conversions: {
      [systemDataTypes.shannons.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 3.321928094887362,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 3.321928094887362,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Hartleys per Second",
      description: "A value expressed in hartleys per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationRate.dataTypeId,
        },
      ],
      label: {
        right: "Hart/s",
      },
    },
    conversions: {
      [systemDataTypes.shannonsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 3.321928094887362,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 3.321928094887362,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Nats",
      description:
        "A logarithmic information unit using base e. Logarithm-base conversion factors are approximate.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationContent.dataTypeId,
        },
      ],
      label: {
        right: "nat",
      },
    },
    conversions: {
      [systemDataTypes.shannons.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1.4426950408889634,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1.4426950408889634,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Nats per Second",
      description: "A value expressed in nats per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationRate.dataTypeId,
        },
      ],
      label: {
        right: "nat/s",
      },
    },
    conversions: {
      [systemDataTypes.shannonsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1.4426950408889634,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1.4426950408889634,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Bits per Second",
      description: "A value expressed in bits per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "bit/s",
      },
    },
    conversions: {},
  },
  {
    definition: {
      title: "Bytes per Second",
      description: "A value expressed in bytes per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "B/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 8,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 8,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Octets",
      description:
        "A group of exactly eight binary digits; equal to one eight-bit byte.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.information.dataTypeId,
        },
      ],
      label: {
        right: "o",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Bauds",
      description:
        "One symbol interval per second; conversion to bits per second requires the coding scheme.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.modulationRate.dataTypeId,
        },
      ],
      label: {
        right: "Bd",
      },
    },
    conversions: {},
  },
  {
    definition: {
      title: "Erlangs",
      description:
        "A traffic intensity corresponding to one resource continuously occupied over the observation interval.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.trafficIntensity.dataTypeId,
        },
      ],
      minimum: 0,
      label: {
        right: "E",
      },
    },
    conversions: {},
  },
  {
    definition: {
      title: "Octaves",
      description:
        "A logarithmic frequency interval corresponding to a frequency ratio of two.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.logarithmicFrequencyInterval.dataTypeId,
        },
      ],
      label: {
        right: "oct",
      },
    },
    conversions: {},
  },
  {
    definition: {
      title: "Semitones",
      description: "One twelfth of an octave in equal temperament.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.logarithmicFrequencyInterval.dataTypeId,
        },
      ],
      label: {
        right: "semitone",
      },
    },
    conversions: {
      [systemDataTypes.octaves.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 0.08333333333333333,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 0.08333333333333333,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Cents (Frequency Interval)",
      description: "One twelve-hundredth of an octave.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.logarithmicFrequencyInterval.dataTypeId,
        },
      ],
      label: {
        right: "cent",
      },
    },
    conversions: {
      [systemDataTypes.octaves.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 0.0008333333333333334,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 0.0008333333333333334,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Decades (Frequency Interval)",
      description:
        "A logarithmic frequency interval corresponding to a frequency ratio of ten.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.logarithmicFrequencyInterval.dataTypeId,
        },
      ],
      label: {
        right: "dec",
      },
    },
    conversions: {
      [systemDataTypes.octaves.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 3.321928094887362,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 3.321928094887362,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Kibibits",
      description: "A binary multiple equal to 2^10 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationBinary.dataTypeId,
        },
      ],
      label: {
        right: "Kibit",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1024,
                type: "number",
              },
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1024,
                type: "number",
              },
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Kibibits per Second",
      description: "A transfer rate of 2^10 bits per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "Kibit/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1024,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1024,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Kibibytes",
      description: "A binary multiple equal to 2^10 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationBinary.dataTypeId,
        },
      ],
      label: {
        right: "KiB",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1024,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1024,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Kibibytes per Second",
      description: "A transfer rate of 2^10 bytes per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "KiB/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1024,
                type: "number",
              },
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1024,
                type: "number",
              },
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Mebibits",
      description: "A binary multiple equal to 2^20 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationBinary.dataTypeId,
        },
      ],
      label: {
        right: "Mibit",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1048576,
                type: "number",
              },
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1048576,
                type: "number",
              },
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Mebibits per Second",
      description: "A transfer rate of 2^20 bits per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "Mibit/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1048576,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1048576,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Mebibytes",
      description: "A binary multiple equal to 2^20 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationBinary.dataTypeId,
        },
      ],
      label: {
        right: "MiB",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1048576,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1048576,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Mebibytes per Second",
      description: "A transfer rate of 2^20 bytes per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "MiB/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1048576,
                type: "number",
              },
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1048576,
                type: "number",
              },
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Gibibits",
      description: "A binary multiple equal to 2^30 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationBinary.dataTypeId,
        },
      ],
      label: {
        right: "Gibit",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1073741824,
                type: "number",
              },
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1073741824,
                type: "number",
              },
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Gibibits per Second",
      description: "A transfer rate of 2^30 bits per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "Gibit/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1073741824,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1073741824,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Gibibytes",
      description: "A binary multiple equal to 2^30 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationBinary.dataTypeId,
        },
      ],
      label: {
        right: "GiB",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1073741824,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1073741824,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Gibibytes per Second",
      description: "A transfer rate of 2^30 bytes per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "GiB/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1073741824,
                type: "number",
              },
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1073741824,
                type: "number",
              },
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Tebibits",
      description: "A binary multiple equal to 2^40 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationBinary.dataTypeId,
        },
      ],
      label: {
        right: "Tibit",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              [
                "*",
                {
                  const: 1073741824,
                  type: "number",
                },
                {
                  const: 1024,
                  type: "number",
                },
              ],
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              [
                "*",
                {
                  const: 1073741824,
                  type: "number",
                },
                {
                  const: 1024,
                  type: "number",
                },
              ],
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Tebibits per Second",
      description: "A transfer rate of 2^40 bits per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "Tibit/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1073741824,
                type: "number",
              },
              {
                const: 1024,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1073741824,
                type: "number",
              },
              {
                const: 1024,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Tebibytes",
      description: "A binary multiple equal to 2^40 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationBinary.dataTypeId,
        },
      ],
      label: {
        right: "TiB",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1073741824,
                type: "number",
              },
              {
                const: 1024,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1073741824,
                type: "number",
              },
              {
                const: 1024,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Tebibytes per Second",
      description: "A transfer rate of 2^40 bytes per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "TiB/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              [
                "*",
                {
                  const: 1073741824,
                  type: "number",
                },
                {
                  const: 1024,
                  type: "number",
                },
              ],
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              [
                "*",
                {
                  const: 1073741824,
                  type: "number",
                },
                {
                  const: 1024,
                  type: "number",
                },
              ],
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Pebibits",
      description: "A binary multiple equal to 2^50 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationBinary.dataTypeId,
        },
      ],
      label: {
        right: "Pibit",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              [
                "*",
                {
                  const: 1073741824,
                  type: "number",
                },
                {
                  const: 1048576,
                  type: "number",
                },
              ],
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              [
                "*",
                {
                  const: 1073741824,
                  type: "number",
                },
                {
                  const: 1048576,
                  type: "number",
                },
              ],
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Pebibits per Second",
      description: "A transfer rate of 2^50 bits per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "Pibit/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1073741824,
                type: "number",
              },
              {
                const: 1048576,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1073741824,
                type: "number",
              },
              {
                const: 1048576,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Pebibytes",
      description: "A binary multiple equal to 2^50 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationBinary.dataTypeId,
        },
      ],
      label: {
        right: "PiB",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1073741824,
                type: "number",
              },
              {
                const: 1048576,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1073741824,
                type: "number",
              },
              {
                const: 1048576,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Pebibytes per Second",
      description: "A transfer rate of 2^50 bytes per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "PiB/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              [
                "*",
                {
                  const: 1073741824,
                  type: "number",
                },
                {
                  const: 1048576,
                  type: "number",
                },
              ],
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              [
                "*",
                {
                  const: 1073741824,
                  type: "number",
                },
                {
                  const: 1048576,
                  type: "number",
                },
              ],
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Exbibits",
      description: "A binary multiple equal to 2^60 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationBinary.dataTypeId,
        },
      ],
      label: {
        right: "Eibit",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              [
                "*",
                {
                  const: 1073741824,
                  type: "number",
                },
                {
                  const: 1073741824,
                  type: "number",
                },
              ],
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              [
                "*",
                {
                  const: 1073741824,
                  type: "number",
                },
                {
                  const: 1073741824,
                  type: "number",
                },
              ],
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Exbibits per Second",
      description: "A transfer rate of 2^60 bits per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "Eibit/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1073741824,
                type: "number",
              },
              {
                const: 1073741824,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1073741824,
                type: "number",
              },
              {
                const: 1073741824,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Exbibytes",
      description: "A binary multiple equal to 2^60 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationBinary.dataTypeId,
        },
      ],
      label: {
        right: "EiB",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1073741824,
                type: "number",
              },
              {
                const: 1073741824,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1073741824,
                type: "number",
              },
              {
                const: 1073741824,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Exbibytes per Second",
      description: "A transfer rate of 2^60 bytes per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "EiB/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              [
                "*",
                {
                  const: 1073741824,
                  type: "number",
                },
                {
                  const: 1073741824,
                  type: "number",
                },
              ],
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              [
                "*",
                {
                  const: 1073741824,
                  type: "number",
                },
                {
                  const: 1073741824,
                  type: "number",
                },
              ],
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Zebibits",
      description: "A binary multiple equal to 2^70 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationBinary.dataTypeId,
        },
      ],
      label: {
        right: "Zibit",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              [
                "*",
                [
                  "*",
                  {
                    const: 1073741824,
                    type: "number",
                  },
                  {
                    const: 1073741824,
                    type: "number",
                  },
                ],
                {
                  const: 1024,
                  type: "number",
                },
              ],
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              [
                "*",
                [
                  "*",
                  {
                    const: 1073741824,
                    type: "number",
                  },
                  {
                    const: 1073741824,
                    type: "number",
                  },
                ],
                {
                  const: 1024,
                  type: "number",
                },
              ],
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Zebibits per Second",
      description: "A transfer rate of 2^70 bits per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "Zibit/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              [
                "*",
                {
                  const: 1073741824,
                  type: "number",
                },
                {
                  const: 1073741824,
                  type: "number",
                },
              ],
              {
                const: 1024,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              [
                "*",
                {
                  const: 1073741824,
                  type: "number",
                },
                {
                  const: 1073741824,
                  type: "number",
                },
              ],
              {
                const: 1024,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Zebibytes",
      description: "A binary multiple equal to 2^70 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationBinary.dataTypeId,
        },
      ],
      label: {
        right: "ZiB",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              [
                "*",
                {
                  const: 1073741824,
                  type: "number",
                },
                {
                  const: 1073741824,
                  type: "number",
                },
              ],
              {
                const: 1024,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              [
                "*",
                {
                  const: 1073741824,
                  type: "number",
                },
                {
                  const: 1073741824,
                  type: "number",
                },
              ],
              {
                const: 1024,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Zebibytes per Second",
      description: "A transfer rate of 2^70 bytes per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "ZiB/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              [
                "*",
                [
                  "*",
                  {
                    const: 1073741824,
                    type: "number",
                  },
                  {
                    const: 1073741824,
                    type: "number",
                  },
                ],
                {
                  const: 1024,
                  type: "number",
                },
              ],
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              [
                "*",
                [
                  "*",
                  {
                    const: 1073741824,
                    type: "number",
                  },
                  {
                    const: 1073741824,
                    type: "number",
                  },
                ],
                {
                  const: 1024,
                  type: "number",
                },
              ],
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Yobibits",
      description: "A binary multiple equal to 2^80 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationBinary.dataTypeId,
        },
      ],
      label: {
        right: "Yibit",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              [
                "*",
                [
                  "*",
                  {
                    const: 1073741824,
                    type: "number",
                  },
                  {
                    const: 1073741824,
                    type: "number",
                  },
                ],
                {
                  const: 1048576,
                  type: "number",
                },
              ],
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              [
                "*",
                [
                  "*",
                  {
                    const: 1073741824,
                    type: "number",
                  },
                  {
                    const: 1073741824,
                    type: "number",
                  },
                ],
                {
                  const: 1048576,
                  type: "number",
                },
              ],
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Yobibits per Second",
      description: "A transfer rate of 2^80 bits per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "Yibit/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              [
                "*",
                {
                  const: 1073741824,
                  type: "number",
                },
                {
                  const: 1073741824,
                  type: "number",
                },
              ],
              {
                const: 1048576,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              [
                "*",
                {
                  const: 1073741824,
                  type: "number",
                },
                {
                  const: 1073741824,
                  type: "number",
                },
              ],
              {
                const: 1048576,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Yobibytes",
      description: "A binary multiple equal to 2^80 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationBinary.dataTypeId,
        },
      ],
      label: {
        right: "YiB",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              [
                "*",
                {
                  const: 1073741824,
                  type: "number",
                },
                {
                  const: 1073741824,
                  type: "number",
                },
              ],
              {
                const: 1048576,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              [
                "*",
                {
                  const: 1073741824,
                  type: "number",
                },
                {
                  const: 1073741824,
                  type: "number",
                },
              ],
              {
                const: 1048576,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Yobibytes per Second",
      description: "A transfer rate of 2^80 bytes per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "YiB/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              [
                "*",
                [
                  "*",
                  {
                    const: 1073741824,
                    type: "number",
                  },
                  {
                    const: 1073741824,
                    type: "number",
                  },
                ],
                {
                  const: 1048576,
                  type: "number",
                },
              ],
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              [
                "*",
                [
                  "*",
                  {
                    const: 1073741824,
                    type: "number",
                  },
                  {
                    const: 1073741824,
                    type: "number",
                  },
                ],
                {
                  const: 1048576,
                  type: "number",
                },
              ],
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Robibits",
      description: "A binary multiple equal to 2^90 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationBinary.dataTypeId,
        },
      ],
      label: {
        right: "Ribit",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              [
                "*",
                [
                  "*",
                  {
                    const: 1073741824,
                    type: "number",
                  },
                  {
                    const: 1073741824,
                    type: "number",
                  },
                ],
                {
                  const: 1073741824,
                  type: "number",
                },
              ],
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              [
                "*",
                [
                  "*",
                  {
                    const: 1073741824,
                    type: "number",
                  },
                  {
                    const: 1073741824,
                    type: "number",
                  },
                ],
                {
                  const: 1073741824,
                  type: "number",
                },
              ],
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Robibits per Second",
      description: "A transfer rate of 2^90 bits per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "Ribit/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              [
                "*",
                {
                  const: 1073741824,
                  type: "number",
                },
                {
                  const: 1073741824,
                  type: "number",
                },
              ],
              {
                const: 1073741824,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              [
                "*",
                {
                  const: 1073741824,
                  type: "number",
                },
                {
                  const: 1073741824,
                  type: "number",
                },
              ],
              {
                const: 1073741824,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Robibytes",
      description: "A binary multiple equal to 2^90 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationBinary.dataTypeId,
        },
      ],
      label: {
        right: "RiB",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              [
                "*",
                {
                  const: 1073741824,
                  type: "number",
                },
                {
                  const: 1073741824,
                  type: "number",
                },
              ],
              {
                const: 1073741824,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              [
                "*",
                {
                  const: 1073741824,
                  type: "number",
                },
                {
                  const: 1073741824,
                  type: "number",
                },
              ],
              {
                const: 1073741824,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Robibytes per Second",
      description: "A transfer rate of 2^90 bytes per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "RiB/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              [
                "*",
                [
                  "*",
                  {
                    const: 1073741824,
                    type: "number",
                  },
                  {
                    const: 1073741824,
                    type: "number",
                  },
                ],
                {
                  const: 1073741824,
                  type: "number",
                },
              ],
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              [
                "*",
                [
                  "*",
                  {
                    const: 1073741824,
                    type: "number",
                  },
                  {
                    const: 1073741824,
                    type: "number",
                  },
                ],
                {
                  const: 1073741824,
                  type: "number",
                },
              ],
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Quebibits",
      description: "A binary multiple equal to 2^100 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationBinary.dataTypeId,
        },
      ],
      label: {
        right: "Qibit",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              [
                "*",
                [
                  "*",
                  [
                    "*",
                    {
                      const: 1073741824,
                      type: "number",
                    },
                    {
                      const: 1073741824,
                      type: "number",
                    },
                  ],
                  {
                    const: 1073741824,
                    type: "number",
                  },
                ],
                {
                  const: 1024,
                  type: "number",
                },
              ],
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              [
                "*",
                [
                  "*",
                  [
                    "*",
                    {
                      const: 1073741824,
                      type: "number",
                    },
                    {
                      const: 1073741824,
                      type: "number",
                    },
                  ],
                  {
                    const: 1073741824,
                    type: "number",
                  },
                ],
                {
                  const: 1024,
                  type: "number",
                },
              ],
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Quebibits per Second",
      description: "A transfer rate of 2^100 bits per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "Qibit/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              [
                "*",
                [
                  "*",
                  {
                    const: 1073741824,
                    type: "number",
                  },
                  {
                    const: 1073741824,
                    type: "number",
                  },
                ],
                {
                  const: 1073741824,
                  type: "number",
                },
              ],
              {
                const: 1024,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              [
                "*",
                [
                  "*",
                  {
                    const: 1073741824,
                    type: "number",
                  },
                  {
                    const: 1073741824,
                    type: "number",
                  },
                ],
                {
                  const: 1073741824,
                  type: "number",
                },
              ],
              {
                const: 1024,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Quebibytes",
      description: "A binary multiple equal to 2^100 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationBinary.dataTypeId,
        },
      ],
      label: {
        right: "QiB",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              [
                "*",
                [
                  "*",
                  {
                    const: 1073741824,
                    type: "number",
                  },
                  {
                    const: 1073741824,
                    type: "number",
                  },
                ],
                {
                  const: 1073741824,
                  type: "number",
                },
              ],
              {
                const: 1024,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              [
                "*",
                [
                  "*",
                  {
                    const: 1073741824,
                    type: "number",
                  },
                  {
                    const: 1073741824,
                    type: "number",
                  },
                ],
                {
                  const: 1073741824,
                  type: "number",
                },
              ],
              {
                const: 1024,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Quebibytes per Second",
      description: "A transfer rate of 2^100 bytes per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "QiB/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              [
                "*",
                [
                  "*",
                  [
                    "*",
                    {
                      const: 1073741824,
                      type: "number",
                    },
                    {
                      const: 1073741824,
                      type: "number",
                    },
                  ],
                  {
                    const: 1073741824,
                    type: "number",
                  },
                ],
                {
                  const: 1024,
                  type: "number",
                },
              ],
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              [
                "*",
                [
                  "*",
                  [
                    "*",
                    {
                      const: 1073741824,
                      type: "number",
                    },
                    {
                      const: 1073741824,
                      type: "number",
                    },
                  ],
                  {
                    const: 1073741824,
                    type: "number",
                  },
                ],
                {
                  const: 1024,
                  type: "number",
                },
              ],
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Kilobits",
      description: "A decimal multiple equal to 10^3 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationDecimal.dataTypeId,
        },
      ],
      label: {
        right: "kbit",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1000,
                type: "number",
              },
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1000,
                type: "number",
              },
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Kilobits per Second",
      description: "A transfer rate of 10^3 bits per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "kbit/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1000,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1000,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Kilobytes per Second",
      description: "A transfer rate of 10^3 bytes per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "kB/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1000,
                type: "number",
              },
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1000,
                type: "number",
              },
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Megabits",
      description: "A decimal multiple equal to 10^6 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationDecimal.dataTypeId,
        },
      ],
      label: {
        right: "Mbit",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1000000,
                type: "number",
              },
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1000000,
                type: "number",
              },
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Megabits per Second",
      description: "A transfer rate of 10^6 bits per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "Mbit/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1000000,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1000000,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Megabytes per Second",
      description: "A transfer rate of 10^6 bytes per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "MB/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1000000,
                type: "number",
              },
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1000000,
                type: "number",
              },
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Gigabits",
      description: "A decimal multiple equal to 10^9 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationDecimal.dataTypeId,
        },
      ],
      label: {
        right: "Gbit",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1000000000,
                type: "number",
              },
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1000000000,
                type: "number",
              },
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Gigabits per Second",
      description: "A transfer rate of 10^9 bits per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "Gbit/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1000000000,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1000000000,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Gigabytes per Second",
      description: "A transfer rate of 10^9 bytes per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "GB/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1000000000,
                type: "number",
              },
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1000000000,
                type: "number",
              },
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Terabits",
      description: "A decimal multiple equal to 10^12 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationDecimal.dataTypeId,
        },
      ],
      label: {
        right: "Tbit",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1000000000000,
                type: "number",
              },
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1000000000000,
                type: "number",
              },
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Terabits per Second",
      description: "A transfer rate of 10^12 bits per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "Tbit/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1000000000000,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1000000000000,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Terabytes per Second",
      description: "A transfer rate of 10^12 bytes per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "TB/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1000000000000,
                type: "number",
              },
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1000000000000,
                type: "number",
              },
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Petabits",
      description: "A decimal multiple equal to 10^15 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationDecimal.dataTypeId,
        },
      ],
      label: {
        right: "Pbit",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1000000000000000,
                type: "number",
              },
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1000000000000000,
                type: "number",
              },
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Petabits per Second",
      description: "A transfer rate of 10^15 bits per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "Pbit/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1000000000000000,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1000000000000000,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Petabytes",
      description: "A decimal multiple equal to 10^15 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationDecimal.dataTypeId,
        },
      ],
      label: {
        right: "PB",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1000000000000000,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1000000000000000,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Petabytes per Second",
      description: "A transfer rate of 10^15 bytes per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "PB/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1000000000000000,
                type: "number",
              },
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1000000000000000,
                type: "number",
              },
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Exabits",
      description: "A decimal multiple equal to 10^18 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationDecimal.dataTypeId,
        },
      ],
      label: {
        right: "Ebit",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1000000000000000000,
                type: "number",
              },
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1000000000000000000,
                type: "number",
              },
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Exabits per Second",
      description: "A transfer rate of 10^18 bits per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "Ebit/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1000000000000000000,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1000000000000000000,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Exabytes",
      description: "A decimal multiple equal to 10^18 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationDecimal.dataTypeId,
        },
      ],
      label: {
        right: "EB",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1000000000000000000,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1000000000000000000,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Exabytes per Second",
      description: "A transfer rate of 10^18 bytes per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "EB/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1000000000000000000,
                type: "number",
              },
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1000000000000000000,
                type: "number",
              },
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Zettabits",
      description: "A decimal multiple equal to 10^21 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationDecimal.dataTypeId,
        },
      ],
      label: {
        right: "Zbit",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1e21,
                type: "number",
              },
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1e21,
                type: "number",
              },
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Zettabits per Second",
      description: "A transfer rate of 10^21 bits per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "Zbit/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1e21,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1e21,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Zettabytes",
      description: "A decimal multiple equal to 10^21 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationDecimal.dataTypeId,
        },
      ],
      label: {
        right: "ZB",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1e21,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1e21,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Zettabytes per Second",
      description: "A transfer rate of 10^21 bytes per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "ZB/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1e21,
                type: "number",
              },
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1e21,
                type: "number",
              },
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Yottabits",
      description: "A decimal multiple equal to 10^24 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationDecimal.dataTypeId,
        },
      ],
      label: {
        right: "Ybit",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1e24,
                type: "number",
              },
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1e24,
                type: "number",
              },
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Yottabits per Second",
      description: "A transfer rate of 10^24 bits per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "Ybit/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1e24,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1e24,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Yottabytes",
      description: "A decimal multiple equal to 10^24 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationDecimal.dataTypeId,
        },
      ],
      label: {
        right: "YB",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1e24,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1e24,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Yottabytes per Second",
      description: "A transfer rate of 10^24 bytes per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "YB/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1e24,
                type: "number",
              },
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1e24,
                type: "number",
              },
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Ronnabits",
      description: "A decimal multiple equal to 10^27 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationDecimal.dataTypeId,
        },
      ],
      label: {
        right: "Rbit",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1e27,
                type: "number",
              },
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1e27,
                type: "number",
              },
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Ronnabits per Second",
      description: "A transfer rate of 10^27 bits per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "Rbit/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1e27,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1e27,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Ronnabytes",
      description: "A decimal multiple equal to 10^27 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationDecimal.dataTypeId,
        },
      ],
      label: {
        right: "RB",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1e27,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1e27,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Ronnabytes per Second",
      description: "A transfer rate of 10^27 bytes per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "RB/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1e27,
                type: "number",
              },
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1e27,
                type: "number",
              },
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Quettabits",
      description: "A decimal multiple equal to 10^30 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationDecimal.dataTypeId,
        },
      ],
      label: {
        right: "Qbit",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1e30,
                type: "number",
              },
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1e30,
                type: "number",
              },
              {
                const: 0.125,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Quettabits per Second",
      description: "A transfer rate of 10^30 bits per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "Qbit/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1e30,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1e30,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Quettabytes",
      description: "A decimal multiple equal to 10^30 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.informationDecimal.dataTypeId,
        },
      ],
      label: {
        right: "QB",
      },
    },
    conversions: {
      [systemDataTypes.bytes.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1e30,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1e30,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Quettabytes per Second",
      description: "A transfer rate of 10^30 bytes per second.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dataTransferRate.dataTypeId,
        },
      ],
      label: {
        right: "QB/s",
      },
    },
    conversions: {
      [systemDataTypes.bitsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            [
              "*",
              {
                const: 1e30,
                type: "number",
              },
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            [
              "*",
              {
                const: 1e30,
                type: "number",
              },
              {
                const: 8,
                type: "number",
              },
            ],
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Kilobauds",
      description: "A value expressed in kilobauds.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.modulationRate.dataTypeId,
        },
      ],
      label: {
        right: "kBd",
      },
    },
    conversions: {
      [systemDataTypes.bauds.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1000,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1000,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Megabauds",
      description: "A value expressed in megabauds.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.modulationRate.dataTypeId,
        },
      ],
      label: {
        right: "MBd",
      },
    },
    conversions: {
      [systemDataTypes.bauds.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1000000,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1000000,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    definition: {
      title: "Gigabauds",
      description: "A value expressed in gigabauds.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.modulationRate.dataTypeId,
        },
      ],
      label: {
        right: "GBd",
      },
    },
    conversions: {
      [systemDataTypes.bauds.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1000000000,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1000000000,
              type: "number",
            },
          ],
        },
      },
    },
  },
];

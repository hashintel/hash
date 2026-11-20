import { systemDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { IsoDataType } from "../data-types";

export const informationUnitsDataTypes: IsoDataType[] = [
  {
    dataTypeBaseUrl: systemDataTypes.informationContent.dataTypeBaseUrl,
    definition: {
      title: "Information Content",
      titlePlural: "Information Contents",
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
    dataTypeBaseUrl: systemDataTypes.informationRate.dataTypeBaseUrl,
    definition: {
      title: "Information Rate",
      titlePlural: "Information Rates",
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
    dataTypeBaseUrl: systemDataTypes.dataTransferRate.dataTypeBaseUrl,
    definition: {
      title: "Data Transfer Rate",
      titlePlural: "Data Transfer Rates",
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
    dataTypeBaseUrl: systemDataTypes.modulationRate.dataTypeBaseUrl,
    definition: {
      title: "Modulation Rate",
      titlePlural: "Modulation Rates",
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
    dataTypeBaseUrl: systemDataTypes.trafficIntensity.dataTypeBaseUrl,
    definition: {
      title: "Traffic Intensity",
      titlePlural: "Traffic Intensities",
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
    dataTypeBaseUrl:
      systemDataTypes.logarithmicFrequencyInterval.dataTypeBaseUrl,
    definition: {
      title: "Logarithmic Frequency Interval",
      titlePlural: "Logarithmic Frequency Intervals",
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
    dataTypeBaseUrl: systemDataTypes.informationBinary.dataTypeBaseUrl,
    definition: {
      title: "Information (Binary)",
      titlePlural: "Information (Binary)",
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
    dataTypeBaseUrl: systemDataTypes.informationDecimal.dataTypeBaseUrl,
    definition: {
      title: "Information (Decimal)",
      titlePlural: "Information (Decimal)",
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
    dataTypeBaseUrl: systemDataTypes.shannons.dataTypeBaseUrl,
    definition: {
      title: "Shannon",
      titlePlural: "Shannons",
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
    dataTypeBaseUrl: systemDataTypes.shannonsPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Shannon per Second",
      titlePlural: "Shannons per Second",
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
    dataTypeBaseUrl: systemDataTypes.hartleys.dataTypeBaseUrl,
    definition: {
      title: "Hartley",
      titlePlural: "Hartleys",
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
    dataTypeBaseUrl: systemDataTypes.hartleysPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Hartley per Second",
      titlePlural: "Hartleys per Second",
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
    dataTypeBaseUrl: systemDataTypes.nats.dataTypeBaseUrl,
    definition: {
      title: "Nat",
      titlePlural: "Nats",
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
    dataTypeBaseUrl: systemDataTypes.natsPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Nat per Second",
      titlePlural: "Nats per Second",
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
    dataTypeBaseUrl: systemDataTypes.bitsPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Bit per Second",
      titlePlural: "Bits per Second",
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
    dataTypeBaseUrl: systemDataTypes.bytesPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Byte per Second",
      titlePlural: "Bytes per Second",
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
    dataTypeBaseUrl: systemDataTypes.octets.dataTypeBaseUrl,
    definition: {
      title: "Octet",
      titlePlural: "Octets",
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
    dataTypeBaseUrl: systemDataTypes.bauds.dataTypeBaseUrl,
    definition: {
      title: "Baud",
      titlePlural: "Bauds",
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
    dataTypeBaseUrl: systemDataTypes.erlangs.dataTypeBaseUrl,
    definition: {
      title: "Erlang",
      titlePlural: "Erlangs",
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
    dataTypeBaseUrl: systemDataTypes.octaves.dataTypeBaseUrl,
    definition: {
      title: "Octave",
      titlePlural: "Octaves",
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
    dataTypeBaseUrl: systemDataTypes.semitones.dataTypeBaseUrl,
    definition: {
      title: "Semitone",
      titlePlural: "Semitones",
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
    dataTypeBaseUrl: systemDataTypes.centsFrequencyInterval.dataTypeBaseUrl,
    definition: {
      title: "Cent (Frequency Interval)",
      titlePlural: "Cents (Frequency Interval)",
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
    dataTypeBaseUrl: systemDataTypes.decadesFrequencyInterval.dataTypeBaseUrl,
    definition: {
      title: "Decade (Frequency Interval)",
      titlePlural: "Decades (Frequency Interval)",
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
    dataTypeBaseUrl: systemDataTypes.kibibits.dataTypeBaseUrl,
    definition: {
      title: "Kibibit",
      titlePlural: "Kibibits",
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
    dataTypeBaseUrl: systemDataTypes.kibibitsPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Kibibit per Second",
      titlePlural: "Kibibits per Second",
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
    dataTypeBaseUrl: systemDataTypes.kibibytes.dataTypeBaseUrl,
    definition: {
      title: "Kibibyte",
      titlePlural: "Kibibytes",
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
    dataTypeBaseUrl: systemDataTypes.kibibytesPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Kibibyte per Second",
      titlePlural: "Kibibytes per Second",
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
    dataTypeBaseUrl: systemDataTypes.mebibits.dataTypeBaseUrl,
    definition: {
      title: "Mebibit",
      titlePlural: "Mebibits",
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
    dataTypeBaseUrl: systemDataTypes.mebibitsPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Mebibit per Second",
      titlePlural: "Mebibits per Second",
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
    dataTypeBaseUrl: systemDataTypes.mebibytes.dataTypeBaseUrl,
    definition: {
      title: "Mebibyte",
      titlePlural: "Mebibytes",
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
    dataTypeBaseUrl: systemDataTypes.mebibytesPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Mebibyte per Second",
      titlePlural: "Mebibytes per Second",
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
    dataTypeBaseUrl: systemDataTypes.gibibits.dataTypeBaseUrl,
    definition: {
      title: "Gibibit",
      titlePlural: "Gibibits",
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
    dataTypeBaseUrl: systemDataTypes.gibibitsPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Gibibit per Second",
      titlePlural: "Gibibits per Second",
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
    dataTypeBaseUrl: systemDataTypes.gibibytes.dataTypeBaseUrl,
    definition: {
      title: "Gibibyte",
      titlePlural: "Gibibytes",
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
    dataTypeBaseUrl: systemDataTypes.gibibytesPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Gibibyte per Second",
      titlePlural: "Gibibytes per Second",
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
    dataTypeBaseUrl: systemDataTypes.tebibits.dataTypeBaseUrl,
    definition: {
      title: "Tebibit",
      titlePlural: "Tebibits",
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
    dataTypeBaseUrl: systemDataTypes.tebibitsPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Tebibit per Second",
      titlePlural: "Tebibits per Second",
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
    dataTypeBaseUrl: systemDataTypes.tebibytes.dataTypeBaseUrl,
    definition: {
      title: "Tebibyte",
      titlePlural: "Tebibytes",
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
    dataTypeBaseUrl: systemDataTypes.tebibytesPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Tebibyte per Second",
      titlePlural: "Tebibytes per Second",
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
    dataTypeBaseUrl: systemDataTypes.pebibits.dataTypeBaseUrl,
    definition: {
      title: "Pebibit",
      titlePlural: "Pebibits",
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
    dataTypeBaseUrl: systemDataTypes.pebibitsPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Pebibit per Second",
      titlePlural: "Pebibits per Second",
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
    dataTypeBaseUrl: systemDataTypes.pebibytes.dataTypeBaseUrl,
    definition: {
      title: "Pebibyte",
      titlePlural: "Pebibytes",
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
    dataTypeBaseUrl: systemDataTypes.pebibytesPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Pebibyte per Second",
      titlePlural: "Pebibytes per Second",
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
    dataTypeBaseUrl: systemDataTypes.exbibits.dataTypeBaseUrl,
    definition: {
      title: "Exbibit",
      titlePlural: "Exbibits",
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
    dataTypeBaseUrl: systemDataTypes.exbibitsPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Exbibit per Second",
      titlePlural: "Exbibits per Second",
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
    dataTypeBaseUrl: systemDataTypes.exbibytes.dataTypeBaseUrl,
    definition: {
      title: "Exbibyte",
      titlePlural: "Exbibytes",
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
    dataTypeBaseUrl: systemDataTypes.exbibytesPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Exbibyte per Second",
      titlePlural: "Exbibytes per Second",
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
    dataTypeBaseUrl: systemDataTypes.zebibits.dataTypeBaseUrl,
    definition: {
      title: "Zebibit",
      titlePlural: "Zebibits",
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
    dataTypeBaseUrl: systemDataTypes.zebibitsPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Zebibit per Second",
      titlePlural: "Zebibits per Second",
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
    dataTypeBaseUrl: systemDataTypes.zebibytes.dataTypeBaseUrl,
    definition: {
      title: "Zebibyte",
      titlePlural: "Zebibytes",
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
    dataTypeBaseUrl: systemDataTypes.zebibytesPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Zebibyte per Second",
      titlePlural: "Zebibytes per Second",
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
    dataTypeBaseUrl: systemDataTypes.yobibits.dataTypeBaseUrl,
    definition: {
      title: "Yobibit",
      titlePlural: "Yobibits",
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
    dataTypeBaseUrl: systemDataTypes.yobibitsPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Yobibit per Second",
      titlePlural: "Yobibits per Second",
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
    dataTypeBaseUrl: systemDataTypes.yobibytes.dataTypeBaseUrl,
    definition: {
      title: "Yobibyte",
      titlePlural: "Yobibytes",
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
    dataTypeBaseUrl: systemDataTypes.yobibytesPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Yobibyte per Second",
      titlePlural: "Yobibytes per Second",
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
    dataTypeBaseUrl: systemDataTypes.robibits.dataTypeBaseUrl,
    definition: {
      title: "Robibit",
      titlePlural: "Robibits",
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
    dataTypeBaseUrl: systemDataTypes.robibitsPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Robibit per Second",
      titlePlural: "Robibits per Second",
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
    dataTypeBaseUrl: systemDataTypes.robibytes.dataTypeBaseUrl,
    definition: {
      title: "Robibyte",
      titlePlural: "Robibytes",
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
    dataTypeBaseUrl: systemDataTypes.robibytesPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Robibyte per Second",
      titlePlural: "Robibytes per Second",
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
    dataTypeBaseUrl: systemDataTypes.quebibits.dataTypeBaseUrl,
    definition: {
      title: "Quebibit",
      titlePlural: "Quebibits",
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
    dataTypeBaseUrl: systemDataTypes.quebibitsPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Quebibit per Second",
      titlePlural: "Quebibits per Second",
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
    dataTypeBaseUrl: systemDataTypes.quebibytes.dataTypeBaseUrl,
    definition: {
      title: "Quebibyte",
      titlePlural: "Quebibytes",
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
    dataTypeBaseUrl: systemDataTypes.quebibytesPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Quebibyte per Second",
      titlePlural: "Quebibytes per Second",
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
    dataTypeBaseUrl: systemDataTypes.kilobits.dataTypeBaseUrl,
    definition: {
      title: "Kilobit",
      titlePlural: "Kilobits",
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
    dataTypeBaseUrl: systemDataTypes.kilobitsPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Kilobit per Second",
      titlePlural: "Kilobits per Second",
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
    dataTypeBaseUrl: systemDataTypes.kilobytesPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Kilobyte per Second",
      titlePlural: "Kilobytes per Second",
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
    dataTypeBaseUrl: systemDataTypes.megabits.dataTypeBaseUrl,
    definition: {
      title: "Megabit",
      titlePlural: "Megabits",
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
    dataTypeBaseUrl: systemDataTypes.megabitsPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Megabit per Second",
      titlePlural: "Megabits per Second",
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
    dataTypeBaseUrl: systemDataTypes.megabytesPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Megabyte per Second",
      titlePlural: "Megabytes per Second",
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
    dataTypeBaseUrl: systemDataTypes.gigabits.dataTypeBaseUrl,
    definition: {
      title: "Gigabit",
      titlePlural: "Gigabits",
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
    dataTypeBaseUrl: systemDataTypes.gigabitsPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Gigabit per Second",
      titlePlural: "Gigabits per Second",
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
    dataTypeBaseUrl: systemDataTypes.gigabytesPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Gigabyte per Second",
      titlePlural: "Gigabytes per Second",
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
    dataTypeBaseUrl: systemDataTypes.terabits.dataTypeBaseUrl,
    definition: {
      title: "Terabit",
      titlePlural: "Terabits",
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
    dataTypeBaseUrl: systemDataTypes.terabitsPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Terabit per Second",
      titlePlural: "Terabits per Second",
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
    dataTypeBaseUrl: systemDataTypes.terabytesPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Terabyte per Second",
      titlePlural: "Terabytes per Second",
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
    dataTypeBaseUrl: systemDataTypes.petabits.dataTypeBaseUrl,
    definition: {
      title: "Petabit",
      titlePlural: "Petabits",
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
    dataTypeBaseUrl: systemDataTypes.petabitsPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Petabit per Second",
      titlePlural: "Petabits per Second",
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
    dataTypeBaseUrl: systemDataTypes.petabytes.dataTypeBaseUrl,
    definition: {
      title: "Petabyte",
      titlePlural: "Petabytes",
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
    dataTypeBaseUrl: systemDataTypes.petabytesPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Petabyte per Second",
      titlePlural: "Petabytes per Second",
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
    dataTypeBaseUrl: systemDataTypes.exabits.dataTypeBaseUrl,
    definition: {
      title: "Exabit",
      titlePlural: "Exabits",
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
    dataTypeBaseUrl: systemDataTypes.exabitsPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Exabit per Second",
      titlePlural: "Exabits per Second",
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
    dataTypeBaseUrl: systemDataTypes.exabytes.dataTypeBaseUrl,
    definition: {
      title: "Exabyte",
      titlePlural: "Exabytes",
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
    dataTypeBaseUrl: systemDataTypes.exabytesPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Exabyte per Second",
      titlePlural: "Exabytes per Second",
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
    dataTypeBaseUrl: systemDataTypes.zettabits.dataTypeBaseUrl,
    definition: {
      title: "Zettabit",
      titlePlural: "Zettabits",
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
    dataTypeBaseUrl: systemDataTypes.zettabitsPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Zettabit per Second",
      titlePlural: "Zettabits per Second",
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
    dataTypeBaseUrl: systemDataTypes.zettabytes.dataTypeBaseUrl,
    definition: {
      title: "Zettabyte",
      titlePlural: "Zettabytes",
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
    dataTypeBaseUrl: systemDataTypes.zettabytesPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Zettabyte per Second",
      titlePlural: "Zettabytes per Second",
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
    dataTypeBaseUrl: systemDataTypes.yottabits.dataTypeBaseUrl,
    definition: {
      title: "Yottabit",
      titlePlural: "Yottabits",
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
    dataTypeBaseUrl: systemDataTypes.yottabitsPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Yottabit per Second",
      titlePlural: "Yottabits per Second",
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
    dataTypeBaseUrl: systemDataTypes.yottabytes.dataTypeBaseUrl,
    definition: {
      title: "Yottabyte",
      titlePlural: "Yottabytes",
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
    dataTypeBaseUrl: systemDataTypes.yottabytesPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Yottabyte per Second",
      titlePlural: "Yottabytes per Second",
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
    dataTypeBaseUrl: systemDataTypes.ronnabits.dataTypeBaseUrl,
    definition: {
      title: "Ronnabit",
      titlePlural: "Ronnabits",
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
    dataTypeBaseUrl: systemDataTypes.ronnabitsPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Ronnabit per Second",
      titlePlural: "Ronnabits per Second",
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
    dataTypeBaseUrl: systemDataTypes.ronnabytes.dataTypeBaseUrl,
    definition: {
      title: "Ronnabyte",
      titlePlural: "Ronnabytes",
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
    dataTypeBaseUrl: systemDataTypes.ronnabytesPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Ronnabyte per Second",
      titlePlural: "Ronnabytes per Second",
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
    dataTypeBaseUrl: systemDataTypes.quettabits.dataTypeBaseUrl,
    definition: {
      title: "Quettabit",
      titlePlural: "Quettabits",
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
    dataTypeBaseUrl: systemDataTypes.quettabitsPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Quettabit per Second",
      titlePlural: "Quettabits per Second",
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
    dataTypeBaseUrl: systemDataTypes.quettabytes.dataTypeBaseUrl,
    definition: {
      title: "Quettabyte",
      titlePlural: "Quettabytes",
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
    dataTypeBaseUrl: systemDataTypes.quettabytesPerSecond.dataTypeBaseUrl,
    definition: {
      title: "Quettabyte per Second",
      titlePlural: "Quettabytes per Second",
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
    dataTypeBaseUrl: systemDataTypes.kilobauds.dataTypeBaseUrl,
    definition: {
      title: "Kilobaud",
      titlePlural: "Kilobauds",
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
    dataTypeBaseUrl: systemDataTypes.megabauds.dataTypeBaseUrl,
    definition: {
      title: "Megabaud",
      titlePlural: "Megabauds",
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
    dataTypeBaseUrl: systemDataTypes.gigabauds.dataTypeBaseUrl,
    definition: {
      title: "Gigabaud",
      titlePlural: "Gigabauds",
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

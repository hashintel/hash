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
    dataTypeBaseUrl: systemDataTypes["information(binary)"].dataTypeBaseUrl,
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
    dataTypeBaseUrl: systemDataTypes["information(decimal)"].dataTypeBaseUrl,
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
    dataTypeBaseUrl: systemDataTypes.shannon.dataTypeBaseUrl,
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
    dataTypeBaseUrl: systemDataTypes.shannonPerSecond.dataTypeBaseUrl,
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
    dataTypeBaseUrl: systemDataTypes.hartley.dataTypeBaseUrl,
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
      [systemDataTypes.shannon.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.hartleyPerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.shannonPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.nat.dataTypeBaseUrl,
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
      [systemDataTypes.shannon.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.natPerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.shannonPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.bitPerSecond.dataTypeBaseUrl,
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
    dataTypeBaseUrl: systemDataTypes.bytePerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.octet.dataTypeBaseUrl,
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
    dataTypeBaseUrl: systemDataTypes.baud.dataTypeBaseUrl,
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
    dataTypeBaseUrl: systemDataTypes.erlang.dataTypeBaseUrl,
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
    dataTypeBaseUrl: systemDataTypes.octave.dataTypeBaseUrl,
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
    dataTypeBaseUrl: systemDataTypes.semitone.dataTypeBaseUrl,
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
      [systemDataTypes.octave.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes["cent(frequencyInterval)"].dataTypeBaseUrl,
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
      [systemDataTypes.octave.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl:
      systemDataTypes["decade(frequencyInterval)"].dataTypeBaseUrl,
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
      [systemDataTypes.octave.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.kibibit.dataTypeBaseUrl,
    definition: {
      title: "Kibibit",
      titlePlural: "Kibibits",
      description: "A binary multiple equal to 2^10 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(binary)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.kibibitPerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.kibibyte.dataTypeBaseUrl,
    definition: {
      title: "Kibibyte",
      titlePlural: "Kibibytes",
      description: "A binary multiple equal to 2^10 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(binary)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.kibibytePerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.mebibit.dataTypeBaseUrl,
    definition: {
      title: "Mebibit",
      titlePlural: "Mebibits",
      description: "A binary multiple equal to 2^20 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(binary)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.mebibitPerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.mebibyte.dataTypeBaseUrl,
    definition: {
      title: "Mebibyte",
      titlePlural: "Mebibytes",
      description: "A binary multiple equal to 2^20 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(binary)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.mebibytePerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.gibibit.dataTypeBaseUrl,
    definition: {
      title: "Gibibit",
      titlePlural: "Gibibits",
      description: "A binary multiple equal to 2^30 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(binary)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.gibibitPerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.gibibyte.dataTypeBaseUrl,
    definition: {
      title: "Gibibyte",
      titlePlural: "Gibibytes",
      description: "A binary multiple equal to 2^30 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(binary)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.gibibytePerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.tebibit.dataTypeBaseUrl,
    definition: {
      title: "Tebibit",
      titlePlural: "Tebibits",
      description: "A binary multiple equal to 2^40 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(binary)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.tebibitPerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.tebibyte.dataTypeBaseUrl,
    definition: {
      title: "Tebibyte",
      titlePlural: "Tebibytes",
      description: "A binary multiple equal to 2^40 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(binary)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.tebibytePerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.pebibit.dataTypeBaseUrl,
    definition: {
      title: "Pebibit",
      titlePlural: "Pebibits",
      description: "A binary multiple equal to 2^50 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(binary)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.pebibitPerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.pebibyte.dataTypeBaseUrl,
    definition: {
      title: "Pebibyte",
      titlePlural: "Pebibytes",
      description: "A binary multiple equal to 2^50 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(binary)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.pebibytePerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.exbibit.dataTypeBaseUrl,
    definition: {
      title: "Exbibit",
      titlePlural: "Exbibits",
      description: "A binary multiple equal to 2^60 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(binary)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.exbibitPerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.exbibyte.dataTypeBaseUrl,
    definition: {
      title: "Exbibyte",
      titlePlural: "Exbibytes",
      description: "A binary multiple equal to 2^60 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(binary)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.exbibytePerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.zebibit.dataTypeBaseUrl,
    definition: {
      title: "Zebibit",
      titlePlural: "Zebibits",
      description: "A binary multiple equal to 2^70 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(binary)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.zebibitPerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.zebibyte.dataTypeBaseUrl,
    definition: {
      title: "Zebibyte",
      titlePlural: "Zebibytes",
      description: "A binary multiple equal to 2^70 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(binary)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.zebibytePerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.yobibit.dataTypeBaseUrl,
    definition: {
      title: "Yobibit",
      titlePlural: "Yobibits",
      description: "A binary multiple equal to 2^80 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(binary)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.yobibitPerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.yobibyte.dataTypeBaseUrl,
    definition: {
      title: "Yobibyte",
      titlePlural: "Yobibytes",
      description: "A binary multiple equal to 2^80 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(binary)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.yobibytePerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.robibit.dataTypeBaseUrl,
    definition: {
      title: "Robibit",
      titlePlural: "Robibits",
      description: "A binary multiple equal to 2^90 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(binary)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.robibitPerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.robibyte.dataTypeBaseUrl,
    definition: {
      title: "Robibyte",
      titlePlural: "Robibytes",
      description: "A binary multiple equal to 2^90 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(binary)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.robibytePerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.quebibit.dataTypeBaseUrl,
    definition: {
      title: "Quebibit",
      titlePlural: "Quebibits",
      description: "A binary multiple equal to 2^100 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(binary)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.quebibitPerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.quebibyte.dataTypeBaseUrl,
    definition: {
      title: "Quebibyte",
      titlePlural: "Quebibytes",
      description: "A binary multiple equal to 2^100 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(binary)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.quebibytePerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.kilobit.dataTypeBaseUrl,
    definition: {
      title: "Kilobit",
      titlePlural: "Kilobits",
      description: "A decimal multiple equal to 10^3 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(decimal)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.kilobitPerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.kilobytePerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.megabit.dataTypeBaseUrl,
    definition: {
      title: "Megabit",
      titlePlural: "Megabits",
      description: "A decimal multiple equal to 10^6 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(decimal)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.megabitPerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.megabytePerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.gigabit.dataTypeBaseUrl,
    definition: {
      title: "Gigabit",
      titlePlural: "Gigabits",
      description: "A decimal multiple equal to 10^9 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(decimal)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.gigabitPerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.gigabytePerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.terabit.dataTypeBaseUrl,
    definition: {
      title: "Terabit",
      titlePlural: "Terabits",
      description: "A decimal multiple equal to 10^12 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(decimal)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.terabitPerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.terabytePerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.petabit.dataTypeBaseUrl,
    definition: {
      title: "Petabit",
      titlePlural: "Petabits",
      description: "A decimal multiple equal to 10^15 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(decimal)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.petabitPerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.petabyte.dataTypeBaseUrl,
    definition: {
      title: "Petabyte",
      titlePlural: "Petabytes",
      description: "A decimal multiple equal to 10^15 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(decimal)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.petabytePerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.exabit.dataTypeBaseUrl,
    definition: {
      title: "Exabit",
      titlePlural: "Exabits",
      description: "A decimal multiple equal to 10^18 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(decimal)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.exabitPerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.exabyte.dataTypeBaseUrl,
    definition: {
      title: "Exabyte",
      titlePlural: "Exabytes",
      description: "A decimal multiple equal to 10^18 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(decimal)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.exabytePerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.zettabit.dataTypeBaseUrl,
    definition: {
      title: "Zettabit",
      titlePlural: "Zettabits",
      description: "A decimal multiple equal to 10^21 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(decimal)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.zettabitPerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.zettabyte.dataTypeBaseUrl,
    definition: {
      title: "Zettabyte",
      titlePlural: "Zettabytes",
      description: "A decimal multiple equal to 10^21 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(decimal)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.zettabytePerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.yottabit.dataTypeBaseUrl,
    definition: {
      title: "Yottabit",
      titlePlural: "Yottabits",
      description: "A decimal multiple equal to 10^24 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(decimal)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.yottabitPerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.yottabyte.dataTypeBaseUrl,
    definition: {
      title: "Yottabyte",
      titlePlural: "Yottabytes",
      description: "A decimal multiple equal to 10^24 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(decimal)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.yottabytePerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.ronnabit.dataTypeBaseUrl,
    definition: {
      title: "Ronnabit",
      titlePlural: "Ronnabits",
      description: "A decimal multiple equal to 10^27 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(decimal)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.ronnabitPerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.ronnabyte.dataTypeBaseUrl,
    definition: {
      title: "Ronnabyte",
      titlePlural: "Ronnabytes",
      description: "A decimal multiple equal to 10^27 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(decimal)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.ronnabytePerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.quettabit.dataTypeBaseUrl,
    definition: {
      title: "Quettabit",
      titlePlural: "Quettabits",
      description: "A decimal multiple equal to 10^30 bits.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(decimal)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.quettabitPerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.quettabyte.dataTypeBaseUrl,
    definition: {
      title: "Quettabyte",
      titlePlural: "Quettabytes",
      description: "A decimal multiple equal to 10^30 bytes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["information(decimal)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.quettabytePerSecond.dataTypeBaseUrl,
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
      [systemDataTypes.bitPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.kilobaud.dataTypeBaseUrl,
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
      [systemDataTypes.baud.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.megabaud.dataTypeBaseUrl,
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
      [systemDataTypes.baud.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.gigabaud.dataTypeBaseUrl,
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
      [systemDataTypes.baud.dataTypeBaseUrl]: {
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

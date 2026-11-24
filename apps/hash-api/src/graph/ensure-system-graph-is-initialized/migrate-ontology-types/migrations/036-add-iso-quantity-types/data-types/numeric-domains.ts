import { systemDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { IsoDataType } from "../data-types";

export const numericDomainsDataTypes: IsoDataType[] = [
  {
    dataTypeBaseUrl: systemDataTypes.negativeNumber.dataTypeBaseUrl,
    definition: {
      title: "Negative Number",
      titlePlural: "Negative Numbers",
      description: "A real number strictly less than zero.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      exclusiveMaximum: 0,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes["non-negativeNumber"].dataTypeBaseUrl,
    definition: {
      title: "Non-negative Number",
      titlePlural: "Non-negative Numbers",
      description: "A real number greater than or equal to zero.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      minimum: 0,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes["non-negativeInteger"].dataTypeBaseUrl,
    definition: {
      title: "Non-negative Integer",
      titlePlural: "Non-negative Integers",
      description: "An integer greater than or equal to zero.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.integer.dataTypeId,
        },
      ],
      minimum: 0,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.positiveInteger.dataTypeBaseUrl,
    definition: {
      title: "Positive Integer",
      titlePlural: "Positive Integers",
      description: "An integer greater than or equal to one.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.integer.dataTypeId,
        },
      ],
      minimum: 1,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes["half-integer"].dataTypeBaseUrl,
    definition: {
      title: "Half-integer",
      titlePlural: "Half-integers",
      description: "An integer multiple of one half, including integers.",
      type: "number",
      allOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
      multipleOf: 0.5,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes["non-negativeHalf-integer"].dataTypeBaseUrl,
    definition: {
      title: "Non-negative Half-integer",
      titlePlural: "Non-negative Half-integers",
      description: "A non-negative integer multiple of one half.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["half-integer"].dataTypeId,
        },
      ],
      minimum: 0,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.boundedFraction.dataTypeBaseUrl,
    definition: {
      title: "Bounded Fraction",
      titlePlural: "Bounded Fractions",
      description:
        "A fraction between zero and the whole, with bounds expressed in each unit.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.dimensionlessRatio.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.unitInterval.dataTypeBaseUrl,
    definition: {
      title: "Unit Interval",
      titlePlural: "Unit Intervals",
      description:
        "A fraction from zero to 1, inclusive; 1 represents the whole.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
      minimum: 0,
      maximum: 1,
      label: {
        right: "1",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl: systemDataTypes.fractionalPercentage.dataTypeBaseUrl,
    definition: {
      title: "Fractional Percentage",
      titlePlural: "Fractional Percentages",
      description:
        "A fraction from zero to 100, inclusive; 100 represents the whole.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
      minimum: 0,
      maximum: 100,
      label: {
        right: "%",
      },
    },
    conversions: {
      [systemDataTypes.unitInterval.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 0.01,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 0.01,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    dataTypeBaseUrl: systemDataTypes.fractionalPartPerMillion.dataTypeBaseUrl,
    definition: {
      title: "Fractional Part per Million",
      titlePlural: "Fractional Parts per Million",
      description:
        "A fraction from zero to 1e+06, inclusive; 1e+06 represents the whole.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
      minimum: 0,
      maximum: 1000000,
      label: {
        right: "ppm",
      },
    },
    conversions: {
      [systemDataTypes.unitInterval.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 0.000001,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 0.000001,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    dataTypeBaseUrl: systemDataTypes.fractionalPartPerBillion.dataTypeBaseUrl,
    definition: {
      title: "Fractional Part per Billion",
      titlePlural: "Fractional Parts per Billion",
      description:
        "A fraction from zero to 1e+09, inclusive; 1e+09 represents the whole.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.boundedFraction.dataTypeId,
        },
      ],
      minimum: 0,
      maximum: 1000000000,
      label: {
        right: "ppb",
      },
    },
    conversions: {
      [systemDataTypes.unitInterval.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1e-9,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1e-9,
              type: "number",
            },
          ],
        },
      },
    },
  },
];

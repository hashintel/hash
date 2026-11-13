import { systemDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { SiUnitDefinition } from "../si-unit-groups";

export const fluidPermeabilityUnits: SiUnitDefinition[] = [
  {
    title: "Darcies",
    description:
      "A non-SI unit of intrinsic permeability equal to 1/1.01325 square micrometres.",
    symbol: "d",
    conversions: {
      [systemDataTypes.squareMetres.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            ["/", "self", { const: 1.01325, type: "number" }],
            { const: 1e-12, type: "number" },
          ],
        },
        from: {
          expression: [
            "*",
            ["/", "self", { const: 1e-12, type: "number" }],
            { const: 1.01325, type: "number" },
          ],
        },
      },
    },
  },
  {
    title: "Millidarcies",
    description:
      "A unit of intrinsic permeability equal to one thousandth of a darcy.",
    symbol: "md",
    conversions: {
      [systemDataTypes.squareMetres.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            ["/", "self", { const: 1.01325, type: "number" }],
            { const: 1e-15, type: "number" },
          ],
        },
        from: {
          expression: [
            "*",
            ["/", "self", { const: 1e-15, type: "number" }],
            { const: 1.01325, type: "number" },
          ],
        },
      },
    },
  },
  {
    title: "Microdarcies",
    description:
      "A unit of intrinsic permeability equal to one millionth of a darcy.",
    symbol: "µd",
    conversions: {
      [systemDataTypes.squareMetres.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            ["/", "self", { const: 1.01325, type: "number" }],
            { const: 1e-18, type: "number" },
          ],
        },
        from: {
          expression: [
            "*",
            ["/", "self", { const: 1e-18, type: "number" }],
            { const: 1.01325, type: "number" },
          ],
        },
      },
    },
  },
  {
    title: "Nanodarcies",
    description:
      "A unit of intrinsic permeability equal to one billionth of a darcy.",
    symbol: "nd",
    conversions: {
      [systemDataTypes.squareMetres.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            ["/", "self", { const: 1.01325, type: "number" }],
            { const: 1e-21, type: "number" },
          ],
        },
        from: {
          expression: [
            "*",
            ["/", "self", { const: 1e-21, type: "number" }],
            { const: 1.01325, type: "number" },
          ],
        },
      },
    },
  },
];

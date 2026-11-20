import { systemDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { IsoDataType } from "../data-types";

export const scaledUnitsDataTypes: IsoDataType[] = [
  {
    dataTypeBaseUrl: systemDataTypes.energyAreaPerMass.dataTypeBaseUrl,
    definition: {
      title: "Energy Area per Mass",
      titlePlural: "Energy Areas per Mass",
      description:
        "Numeric values in convertible units of energy area per mass.",
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
    dataTypeBaseUrl: systemDataTypes.energyAreaPerMassMetric.dataTypeBaseUrl,
    definition: {
      title: "Energy Area per Mass (Metric)",
      titlePlural: "Energy Areas per Mass (Metric)",
      description:
        "Energy Area per Mass expressed in SI units and metric multiples.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.energyAreaPerMass.dataTypeId,
        },
      ],
      abstract: true,
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.jouleSquareMetersPerKilogram.dataTypeBaseUrl,
    definition: {
      title: "Joule Square Meter per Kilogram",
      titlePlural: "Joule Square Meters per Kilogram",
      description: "A value expressed in joule square meters per kilogram.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.energyAreaPerMassMetric.dataTypeId,
        },
      ],
      label: {
        right: "J·m²/kg",
      },
    },
    conversions: {},
  },
  {
    dataTypeBaseUrl:
      systemDataTypes.electronvoltSquareMetersPerKilogram.dataTypeBaseUrl,
    definition: {
      title: "Electronvolt Square Meter per Kilogram",
      titlePlural: "Electronvolt Square Meters per Kilogram",
      description:
        "A value expressed in electronvolt square meters per kilogram.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.energyAreaPerMassMetric.dataTypeId,
        },
      ],
      label: {
        right: "eV·m²/kg",
      },
    },
    conversions: {
      [systemDataTypes.jouleSquareMetersPerKilogram.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1.602176634e-19,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1.602176634e-19,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    dataTypeBaseUrl: systemDataTypes.gramsPerMole.dataTypeBaseUrl,
    definition: {
      title: "Gram per Mole",
      titlePlural: "Grams per Mole",
      description: "A value expressed in grams per mole.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.molarMassMetric.dataTypeId,
        },
      ],
      label: {
        right: "g/mol",
      },
    },
    conversions: {
      [systemDataTypes.kilogramsPerMole.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 0.001,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 0.001,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    dataTypeBaseUrl: systemDataTypes.cubicCentimetersPerMole.dataTypeBaseUrl,
    definition: {
      title: "Cubic Centimeter per Mole",
      titlePlural: "Cubic Centimeters per Mole",
      description: "A value expressed in cubic centimeters per mole.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.molarVolumeMetric.dataTypeId,
        },
      ],
      label: {
        right: "cm³/mol",
      },
    },
    conversions: {
      [systemDataTypes.cubicMetersPerMole.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.millimolesPerKilogram.dataTypeBaseUrl,
    definition: {
      title: "Millimole per Kilogram",
      titlePlural: "Millimoles per Kilogram",
      description: "A value expressed in millimoles per kilogram.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.molalityMetric.dataTypeId,
        },
      ],
      label: {
        right: "mmol/kg",
      },
    },
    conversions: {
      [systemDataTypes.molesPerKilogram.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 0.001,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 0.001,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    dataTypeBaseUrl: systemDataTypes.millisiemensPerCentimeter.dataTypeBaseUrl,
    definition: {
      title: "Millisiemens per Centimeter",
      titlePlural: "Millisiemens per Centimeter",
      description: "A value expressed in millisiemens per centimeter.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.electricConductivityMetric.dataTypeId,
        },
      ],
      label: {
        right: "mS/cm",
      },
    },
    conversions: {
      [systemDataTypes.siemensPerMeter.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 0.1,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 0.1,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    dataTypeBaseUrl: systemDataTypes.microsiemensPerCentimeter.dataTypeBaseUrl,
    definition: {
      title: "Microsiemens per Centimeter",
      titlePlural: "Microsiemens per Centimeter",
      description: "A value expressed in microsiemens per centimeter.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.electricConductivityMetric.dataTypeId,
        },
      ],
      label: {
        right: "μS/cm",
      },
    },
    conversions: {
      [systemDataTypes.siemensPerMeter.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 0.0001,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 0.0001,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    dataTypeBaseUrl: systemDataTypes.ohmCentimeters.dataTypeBaseUrl,
    definition: {
      title: "Ohm Centimeter",
      titlePlural: "Ohm Centimeters",
      description: "A value expressed in ohm centimeters.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.electricResistivityMetric.dataTypeId,
        },
      ],
      label: {
        right: "Ω·cm",
      },
    },
    conversions: {
      [systemDataTypes.ohmMeters.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.kilovoltAmperes.dataTypeBaseUrl,
    definition: {
      title: "Kilovolt Ampere",
      titlePlural: "Kilovolt Amperes",
      description: "A value expressed in kilovolt amperes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.apparentPowerMetric.dataTypeId,
        },
      ],
      label: {
        right: "kVA",
      },
    },
    conversions: {
      [systemDataTypes.voltAmperes.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.kilovars.dataTypeBaseUrl,
    definition: {
      title: "Kilovar",
      titlePlural: "Kilovars",
      description: "A value expressed in kilovars.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.reactivePowerMetric.dataTypeId,
        },
      ],
      label: {
        right: "kvar",
      },
    },
    conversions: {
      [systemDataTypes.vars.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.sievertsPerHour.dataTypeBaseUrl,
    definition: {
      title: "Sievert per Hour",
      titlePlural: "Sieverts per Hour",
      description: "A value expressed in sieverts per hour.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.doseEquivalentRateMetric.dataTypeId,
        },
      ],
      label: {
        right: "Sv/h",
      },
    },
    conversions: {
      [systemDataTypes.sievertsPerSecond.dataTypeBaseUrl]: {
        to: {
          expression: [
            "/",
            "self",
            {
              const: 3600,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "*",
            "self",
            {
              const: 3600,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    dataTypeBaseUrl: systemDataTypes.barns.dataTypeBaseUrl,
    definition: {
      title: "Barn",
      titlePlural: "Barns",
      description:
        "A unit of effective cross section equal to exactly 10^-28 square meters.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.areaMetric.dataTypeId,
        },
      ],
      label: {
        right: "b",
      },
    },
    conversions: {
      [systemDataTypes.squareMetres.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1e-28,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1e-28,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    dataTypeBaseUrl: systemDataTypes.angstroms.dataTypeBaseUrl,
    definition: {
      title: "Angstrom",
      titlePlural: "Angstroms",
      description:
        "A unit of length equal to exactly 10^-10 meters, used for atomic distances and wavelengths.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.lengthMetric.dataTypeId,
        },
      ],
      label: {
        right: "Å",
      },
    },
    conversions: {
      [systemDataTypes.meters.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1e-10,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1e-10,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    dataTypeBaseUrl: systemDataTypes.astronomicalUnits.dataTypeBaseUrl,
    definition: {
      title: "Astronomical Unit",
      titlePlural: "Astronomical Units",
      description:
        "A unit of astronomical length equal to exactly 149597870700 meters.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.lengthMetric.dataTypeId,
        },
      ],
      label: {
        right: "au",
      },
    },
    conversions: {
      [systemDataTypes.meters.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 149597870700,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 149597870700,
              type: "number",
            },
          ],
        },
      },
    },
  },
  {
    dataTypeBaseUrl: systemDataTypes.daltons.dataTypeBaseUrl,
    definition: {
      title: "Dalton",
      titlePlural: "Daltons",
      description:
        "The unified atomic mass unit, one twelfth of the mass of a free carbon-12 atom at rest in its ground state. The kilogram conversion uses the approximate 2022 CODATA value 1.66053906892 × 10^-27 kg.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes.massMetric.dataTypeId,
        },
      ],
      label: {
        right: "Da",
      },
    },
    conversions: {
      [systemDataTypes.kilograms.dataTypeBaseUrl]: {
        to: {
          expression: [
            "*",
            "self",
            {
              const: 1.66053906892e-27,
              type: "number",
            },
          ],
        },
        from: {
          expression: [
            "/",
            "self",
            {
              const: 1.66053906892e-27,
              type: "number",
            },
          ],
        },
      },
    },
  },
];

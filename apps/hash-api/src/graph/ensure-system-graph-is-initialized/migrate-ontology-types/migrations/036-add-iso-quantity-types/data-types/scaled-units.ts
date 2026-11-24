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
    dataTypeBaseUrl:
      systemDataTypes["energyAreaPerMass(metric)"].dataTypeBaseUrl,
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
      systemDataTypes.jouleSquareMeterPerKilogram.dataTypeBaseUrl,
    definition: {
      title: "Joule Square Meter per Kilogram",
      titlePlural: "Joule Square Meters per Kilogram",
      description: "A value expressed in joule square meters per kilogram.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["energyAreaPerMass(metric)"].dataTypeId,
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
      systemDataTypes.electronvoltSquareMeterPerKilogram.dataTypeBaseUrl,
    definition: {
      title: "Electronvolt Square Meter per Kilogram",
      titlePlural: "Electronvolt Square Meters per Kilogram",
      description:
        "A value expressed in electronvolt square meters per kilogram.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["energyAreaPerMass(metric)"].dataTypeId,
        },
      ],
      label: {
        right: "eV·m²/kg",
      },
    },
    conversions: {
      [systemDataTypes.jouleSquareMeterPerKilogram.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.gramPerMole.dataTypeBaseUrl,
    definition: {
      title: "Gram per Mole",
      titlePlural: "Grams per Mole",
      description: "A value expressed in grams per mole.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["molarMass(metric)"].dataTypeId,
        },
      ],
      label: {
        right: "g/mol",
      },
    },
    conversions: {
      [systemDataTypes.kilogramPerMole.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.cubicCentimeterPerMole.dataTypeBaseUrl,
    definition: {
      title: "Cubic Centimeter per Mole",
      titlePlural: "Cubic Centimeters per Mole",
      description: "A value expressed in cubic centimeters per mole.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["molarVolume(metric)"].dataTypeId,
        },
      ],
      label: {
        right: "cm³/mol",
      },
    },
    conversions: {
      [systemDataTypes.cubicMeterPerMole.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.millimolePerKilogram.dataTypeBaseUrl,
    definition: {
      title: "Millimole per Kilogram",
      titlePlural: "Millimoles per Kilogram",
      description: "A value expressed in millimoles per kilogram.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["molality(metric)"].dataTypeId,
        },
      ],
      label: {
        right: "mmol/kg",
      },
    },
    conversions: {
      [systemDataTypes.molePerKilogram.dataTypeBaseUrl]: {
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
          $ref: systemDataTypes["electricConductivity(metric)"].dataTypeId,
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
          $ref: systemDataTypes["electricConductivity(metric)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.ohmCentimeter.dataTypeBaseUrl,
    definition: {
      title: "Ohm Centimeter",
      titlePlural: "Ohm Centimeters",
      description: "A value expressed in ohm centimeters.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["electricResistivity(metric)"].dataTypeId,
        },
      ],
      label: {
        right: "Ω·cm",
      },
    },
    conversions: {
      [systemDataTypes.ohmMeter.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.kilovoltAmpere.dataTypeBaseUrl,
    definition: {
      title: "Kilovolt Ampere",
      titlePlural: "Kilovolt Amperes",
      description: "A value expressed in kilovolt amperes.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["apparentPower(metric)"].dataTypeId,
        },
      ],
      label: {
        right: "kVA",
      },
    },
    conversions: {
      [systemDataTypes.voltAmpere.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.kilovar.dataTypeBaseUrl,
    definition: {
      title: "Kilovar",
      titlePlural: "Kilovars",
      description: "A value expressed in kilovars.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["reactivePower(metric)"].dataTypeId,
        },
      ],
      label: {
        right: "kvar",
      },
    },
    conversions: {
      [systemDataTypes.var.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.sievertPerHour.dataTypeBaseUrl,
    definition: {
      title: "Sievert per Hour",
      titlePlural: "Sieverts per Hour",
      description: "A value expressed in sieverts per hour.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["doseEquivalentRate(metric)"].dataTypeId,
        },
      ],
      label: {
        right: "Sv/h",
      },
    },
    conversions: {
      [systemDataTypes.sievertPerSecond.dataTypeBaseUrl]: {
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
    dataTypeBaseUrl: systemDataTypes.barn.dataTypeBaseUrl,
    definition: {
      title: "Barn",
      titlePlural: "Barns",
      description:
        "A unit of effective cross section equal to exactly 10^-28 square meters.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["area(metric)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.angstrom.dataTypeBaseUrl,
    definition: {
      title: "Angstrom",
      titlePlural: "Angstroms",
      description:
        "A unit of length equal to exactly 10^-10 meters, used for atomic distances and wavelengths.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["length(metric)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.astronomicalUnit.dataTypeBaseUrl,
    definition: {
      title: "Astronomical Unit",
      titlePlural: "Astronomical Units",
      description:
        "A unit of astronomical length equal to exactly 149597870700 meters.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["length(metric)"].dataTypeId,
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
    dataTypeBaseUrl: systemDataTypes.dalton.dataTypeBaseUrl,
    definition: {
      title: "Dalton",
      titlePlural: "Daltons",
      description:
        "The unified atomic mass unit, one twelfth of the mass of a free carbon-12 atom at rest in its ground state. The kilogram conversion uses the approximate 2022 CODATA value 1.66053906892 × 10^-27 kg.",
      type: "number",
      allOf: [
        {
          $ref: systemDataTypes["mass(metric)"].dataTypeId,
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

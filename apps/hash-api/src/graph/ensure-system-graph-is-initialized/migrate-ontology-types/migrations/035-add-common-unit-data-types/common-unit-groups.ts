import { systemDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import {
  affineConversion,
  scaledConversion,
} from "../034-add-si-unit-data-types/shared/conversions";
import { siUnitGroups } from "../034-add-si-unit-data-types/si-unit-groups";

import type {
  SiUnitDefinition,
  SiUnitGroup,
} from "../034-add-si-unit-data-types/si-unit-groups";

const additionalUnits: Partial<Record<string, SiUnitDefinition[]>> = {
  "Radionuclide Activity": [
    {
      title: "Curie",
      titlePlural: "Curies",
      symbol: "Ci",
      description:
        "A unit of radionuclide activity equal to exactly 37 billion becquerels.",
      conversions: {
        [systemDataTypes.becquerel.dataTypeBaseUrl]: scaledConversion({
          factor: 37000000000,
          divisor: 1,
        }),
      },
    },
  ],
  "Absorbed Dose": [
    {
      title: "Rad",
      titlePlural: "Rads",
      symbol: "rad",
      description: "A unit of absorbed radiation dose equal to 0.01 gray.",
      conversions: {
        [systemDataTypes.gray.dataTypeBaseUrl]: scaledConversion({
          factor: 0.01,
          divisor: 1,
        }),
      },
    },
  ],
  "Dose Equivalent": [
    {
      title: "Rem",
      titlePlural: "Rems",
      symbol: "rem",
      description: "A unit of dose equivalent equal to 0.01 sievert.",
      conversions: {
        [systemDataTypes.sievert.dataTypeBaseUrl]: scaledConversion({
          factor: 0.01,
          divisor: 1,
        }),
      },
    },
  ],
  Length: [
    {
      title: "Nautical Mile",
      titlePlural: "Nautical Miles",
      symbol: "nmi",
      description:
        "The international nautical mile, equal to exactly 1852 meters.",
      systems: ["Metric", "Imperial"],
      conversions: {
        [systemDataTypes.meters.dataTypeBaseUrl]: scaledConversion({
          factor: 1852,
          divisor: 1,
        }),
      },
    },
  ],
  Area: [
    {
      title: "Hectare",
      titlePlural: "Hectares",
      symbol: "ha",
      description: "A unit of area equal to 10000 square meters.",
      conversions: {
        [systemDataTypes.squareMetres.dataTypeBaseUrl]: scaledConversion({
          factor: 10000,
          divisor: 1,
        }),
      },
    },
  ],
  Mass: [
    {
      title: "Metric Carat",
      titlePlural: "Metric Carats",
      symbol: "ct",
      description: "A unit of mass for gemstones equal to exactly 0.2 grams.",
      conversions: {
        [systemDataTypes.kilograms.dataTypeBaseUrl]: scaledConversion({
          factor: 0.0002,
          divisor: 1,
        }),
      },
    },
  ],
  Speed: [
    {
      title: "Knots",
      symbol: "kn",
      description:
        "A speed of one international nautical mile per hour, equal to 1852/3600 meters per second.",
      systems: ["Metric", "Imperial"],
      conversions: {
        [systemDataTypes.metersPerSecond.dataTypeBaseUrl]: scaledConversion({
          factor: 1852,
          divisor: 3600,
        }),
      },
    },
  ],
  Pressure: [
    {
      title: "Millibar",
      titlePlural: "Millibars",
      symbol: "mbar",
      description: "A unit of pressure equal to 100 pascals.",
      conversions: {
        [systemDataTypes.pascal.dataTypeBaseUrl]: scaledConversion({
          factor: 100,
          divisor: 1,
        }),
      },
    },
    {
      title: "Torr",
      titlePlural: "Torrs",
      symbol: "Torr",
      description:
        "A unit of pressure equal to exactly 1/760 of a standard atmosphere.",
      conversions: {
        [systemDataTypes.pascal.dataTypeBaseUrl]: scaledConversion({
          factor: 101325,
          divisor: 760,
        }),
      },
    },
    {
      title: "Millimeter of Mercury (Conventional)",
      titlePlural: "Millimeters of Mercury (Conventional)",
      symbol: "mmHg",
      description:
        "A conventional pressure unit equal to 133.322387415 pascals, using mercury density 13595.1 kilograms per cubic meter and standard gravity.",
      conversions: {
        [systemDataTypes.pascal.dataTypeBaseUrl]: scaledConversion({
          factor: 133.322387415,
          divisor: 1,
        }),
      },
    },
    {
      title: "Inch of Water (Conventional)",
      titlePlural: "Inches of Water (Conventional)",
      symbol: "inH₂O",
      description:
        "A conventional pressure unit equal to 249.08891 pascals, using water density 1000 kilograms per cubic meter and standard gravity.",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.pascal.dataTypeBaseUrl]: scaledConversion({
          factor: 249.08891,
          divisor: 1,
        }),
      },
    },
  ],
  Energy: [
    {
      title: "Electronvolt",
      titlePlural: "Electronvolts",
      symbol: "eV",
      description:
        "A unit of energy equal to exactly 1.602176634 × 10⁻¹⁹ joules.",
      conversions: {
        [systemDataTypes.joule.dataTypeBaseUrl]: {
          to: {
            expression: [
              "*",
              "self",
              { const: 1.602176634e-19, type: "number" },
            ],
          },
          from: {
            expression: [
              "/",
              "self",
              { const: 1.602176634e-19, type: "number" },
            ],
          },
        },
      },
    },
    {
      title: "Calorie (Thermochemical)",
      titlePlural: "Calories (Thermochemical)",
      symbol: "cal (th)",
      description: "A unit of energy equal to exactly 4.184 joules.",
      conversions: {
        [systemDataTypes.joule.dataTypeBaseUrl]: scaledConversion({
          factor: 4.184,
          divisor: 1,
        }),
      },
    },
    {
      title: "Kilocalorie (Thermochemical)",
      titlePlural: "Kilocalories (Thermochemical)",
      symbol: "kcal (th)",
      description:
        "A unit of energy equal to exactly 4184 joules. A nutritional Calorie under this definition is one kilocalorie.",
      conversions: {
        [systemDataTypes.joule.dataTypeBaseUrl]: scaledConversion({
          factor: 4184,
          divisor: 1,
        }),
      },
    },
    {
      title: "Calorie (IT)",
      titlePlural: "Calories (IT)",
      symbol: "cal (IT)",
      description: "A unit of energy equal to exactly 4.1868 joules.",
      conversions: {
        [systemDataTypes.joule.dataTypeBaseUrl]: scaledConversion({
          factor: 4.1868,
          divisor: 1,
        }),
      },
    },
    {
      title: "Kilocalorie (IT)",
      titlePlural: "Kilocalories (IT)",
      symbol: "kcal (IT)",
      description:
        "A unit of energy equal to exactly 4186.8 joules. A nutritional Calorie under this definition is one kilocalorie.",
      conversions: {
        [systemDataTypes.joule.dataTypeBaseUrl]: scaledConversion({
          factor: 4186.8,
          divisor: 1,
        }),
      },
    },
    {
      title: "Therm (US)",
      titlePlural: "Therms (US)",
      symbol: "therm (US)",
      description: "The US therm, equal to exactly 105480400 joules.",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.joule.dataTypeBaseUrl]: scaledConversion({
          factor: 105480400,
          divisor: 1,
        }),
      },
    },
    {
      title: "Therm (EC)",
      titlePlural: "Therms (EC)",
      symbol: "therm (EC)",
      description: "The EC therm, equal to exactly 105506000 joules.",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.joule.dataTypeBaseUrl]: scaledConversion({
          factor: 105506000,
          divisor: 1,
        }),
      },
    },
  ],
  Power: [
    {
      title: "Metric Horsepower",
      titlePlural: "Metric Horsepower",
      symbol: "PS",
      description:
        "A unit of power equal to 75 kilogram-force meters per second, or exactly 735.49875 watts.",
      conversions: {
        [systemDataTypes.watts.dataTypeBaseUrl]: scaledConversion({
          factor: 735.49875,
          divisor: 1,
        }),
      },
    },
  ],
  Angle: [
    {
      title: "Arcminute",
      titlePlural: "Arcminutes",
      symbol: "′",
      description: "A unit of plane angle equal to 1/60 of a degree.",
      conversions: {
        [systemDataTypes.degree.dataTypeBaseUrl]: scaledConversion({
          factor: 1,
          divisor: 60,
        }),
      },
    },
    {
      title: "Arcsecond",
      titlePlural: "Arcseconds",
      symbol: "″",
      description: "A unit of plane angle equal to 1/3600 of a degree.",
      conversions: {
        [systemDataTypes.degree.dataTypeBaseUrl]: scaledConversion({
          factor: 1,
          divisor: 3600,
        }),
      },
    },
    {
      title: "Revolution",
      titlePlural: "Revolutions",
      symbol: "rev",
      description: "A complete turn, equal to 360 degrees.",
      conversions: {
        [systemDataTypes.degree.dataTypeBaseUrl]: scaledConversion({
          factor: 360,
          divisor: 1,
        }),
      },
    },
  ],
  "Angular Velocity": [
    {
      title: "Revolution per Second",
      titlePlural: "Revolutions per Second",
      symbol: "rev/s",
      description:
        "An angular velocity of one full turn per second, equal to 2π radians per second.",
      conversions: {
        [systemDataTypes.radianPerSecond.dataTypeBaseUrl]: scaledConversion({
          factor: 2 * Math.PI,
        }),
      },
    },
    {
      title: "Revolution per Minute",
      titlePlural: "Revolutions per Minute",
      symbol: "rpm",
      description:
        "An angular velocity of one full turn per minute, equal to π/30 radians per second.",
      conversions: {
        [systemDataTypes.radianPerSecond.dataTypeBaseUrl]: scaledConversion({
          factor: Math.PI,
          divisor: 30,
        }),
      },
    },
  ],
  Acceleration: [
    {
      title: "Standard Gravity",
      titlePlural: "Standard Gravities",
      symbol: "g₀",
      description:
        "A unit of acceleration equal to the standard acceleration of free fall, exactly 9.80665 meters per second squared.",
      conversions: {
        [systemDataTypes.meterPerSecondSquared.dataTypeBaseUrl]:
          scaledConversion({ factor: 9.80665, divisor: 1 }),
      },
    },
  ],
  Force: [
    {
      title: "Kilogram-Force",
      titlePlural: "Kilograms-Force",
      symbol: "kgf",
      description:
        "The force exerted on one kilogram under standard gravity, equal to exactly 9.80665 newtons.",
      conversions: {
        [systemDataTypes.newton.dataTypeBaseUrl]: scaledConversion({
          factor: 9.80665,
          divisor: 1,
        }),
      },
    },
  ],
  "Dynamic Viscosity": [
    {
      title: "Poise",
      titlePlural: "Poises",
      symbol: "P",
      description:
        "A CGS unit of dynamic viscosity equal to 0.1 pascal seconds.",
      conversions: {
        [systemDataTypes.pascalSecond.dataTypeBaseUrl]: scaledConversion({
          factor: 0.1,
          divisor: 1,
        }),
      },
    },
    {
      title: "Centipoise",
      titlePlural: "Centipoises",
      symbol: "cP",
      description: "A unit of dynamic viscosity equal to 0.001 pascal seconds.",
      conversions: {
        [systemDataTypes.pascalSecond.dataTypeBaseUrl]: scaledConversion({
          factor: 0.001,
          divisor: 1,
        }),
      },
    },
  ],
  "Mass Density": [
    {
      title: "Milligram per Deciliter",
      titlePlural: "Milligrams per Deciliter",
      symbol: "mg/dL",
      description:
        "A unit of mass per volume equal to 0.01 kilograms per cubic meter; used for mass concentration.",
      conversions: {
        [systemDataTypes.kilogramPerCubicMeter.dataTypeBaseUrl]:
          scaledConversion({ factor: 0.01, divisor: 1 }),
      },
    },
    {
      title: "Milligram per Liter",
      titlePlural: "Milligrams per Liter",
      symbol: "mg/L",
      description:
        "A unit of mass per volume equal to 0.001 kilograms per cubic meter; used for mass concentration.",
      conversions: {
        [systemDataTypes.kilogramPerCubicMeter.dataTypeBaseUrl]:
          scaledConversion({ factor: 0.001, divisor: 1 }),
      },
    },
    {
      title: "Gram per Liter",
      titlePlural: "Grams per Liter",
      symbol: "g/L",
      description:
        "A unit of mass per volume equal to one kilogram per cubic meter; used for mass concentration.",
      conversions: {
        [systemDataTypes.kilogramPerCubicMeter.dataTypeBaseUrl]:
          scaledConversion({ factor: 1, divisor: 1 }),
      },
    },
  ],
  Luminance: [
    {
      title: "Foot-Lambert",
      titlePlural: "Foot-Lamberts",
      symbol: "fL",
      description: "A unit of luminance equal to 1/π candela per square foot.",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.candelaPerSquareMeter.dataTypeBaseUrl]: {
          to: {
            expression: [
              "/",
              ["/", "self", { const: 3.141592653589793, type: "number" }],
              { const: 0.09290304, type: "number" },
            ],
          },
          from: {
            expression: [
              "*",
              ["*", "self", { const: 0.09290304, type: "number" }],
              { const: 3.141592653589793, type: "number" },
            ],
          },
        },
      },
    },
  ],
};

const additionalGroups: SiUnitGroup[] = [
  {
    title: "Temperature Difference",
    titlePlural: "Temperature Differences",
    description:
      "A signed difference between two temperatures, converted by scale alone without temperature-reading offsets.",
    units: [
      {
        title: "Kelvin Difference",
        titlePlural: "Kelvin Differences",
        symbol: "K",
        description:
          "A temperature difference expressed in kelvins. Negative values represent a decrease; zero represents no change.",
      },
      {
        title: "Celsius Difference",
        titlePlural: "Celsius Differences",
        symbol: "°C",
        description:
          "A temperature difference expressed in degrees Celsius. One degree Celsius of difference equals one kelvin of difference, with no offset.",
        conversions: {
          [systemDataTypes.kelvinDifference.dataTypeBaseUrl]: scaledConversion({
            factor: 1,
          }),
        },
      },
      {
        title: "Fahrenheit Difference",
        titlePlural: "Fahrenheit Differences",
        systems: ["Imperial"],
        symbol: "°F",
        description:
          "A temperature difference expressed in degrees Fahrenheit. One degree Fahrenheit of difference equals exactly 5/9 kelvin of difference, with no offset.",
        conversions: {
          [systemDataTypes.kelvinDifference.dataTypeBaseUrl]: scaledConversion({
            factor: 5,
            divisor: 9,
          }),
        },
      },
      {
        title: "Rankine Difference",
        titlePlural: "Rankine Differences",
        systems: ["Imperial"],
        symbol: "°R",
        description:
          "A temperature difference expressed in degrees Rankine. One degree Rankine of difference equals exactly 5/9 kelvin of difference, with no offset.",
        conversions: {
          [systemDataTypes.kelvinDifference.dataTypeBaseUrl]: scaledConversion({
            factor: 5,
            divisor: 9,
          }),
        },
      },
    ],
  },
  {
    title: "Kinematic Viscosity",
    titlePlural: "Kinematic Viscosities",
    description: "A measure of dynamic viscosity divided by mass density.",
    units: [
      {
        title: "Square Meter per Second",
        titlePlural: "Square Meters per Second",
        symbol: "m²/s",
        description: "The coherent SI unit of kinematic viscosity.",
      },
      {
        title: "Square Millimeter per Second",
        titlePlural: "Square Millimeters per Second",
        symbol: "mm²/s",
        description:
          "A unit of kinematic viscosity equal to 1e-06 square meters per second.",
        conversions: {
          [systemDataTypes.squareMeterPerSecond.dataTypeBaseUrl]:
            scaledConversion({ factor: 1e-6, divisor: 1 }),
        },
      },
      {
        title: "Stokes",
        titlePlural: "Stokes",
        symbol: "St",
        description:
          "A unit of kinematic viscosity equal to 0.0001 square meters per second.",
        conversions: {
          [systemDataTypes.squareMeterPerSecond.dataTypeBaseUrl]:
            scaledConversion({ factor: 0.0001, divisor: 1 }),
        },
      },
      {
        title: "Centistokes",
        titlePlural: "Centistokes",
        symbol: "cSt",
        description:
          "A unit of kinematic viscosity equal to 1e-06 square meters per second.",
        conversions: {
          [systemDataTypes.squareMeterPerSecond.dataTypeBaseUrl]:
            scaledConversion({ factor: 1e-6, divisor: 1 }),
        },
      },
    ],
  },
  {
    title: "Dimensionless Ratio",
    titlePlural: "Dimensionless Ratios",
    description:
      "A numerical ratio whose numerator and denominator have the same quantity kind; the property specifies the basis.",
    units: [
      {
        title: "One",
        titlePlural: "Ones",
        symbol: "1",
        description:
          "The unit for a dimensionless ratio; the property specifies the compared quantities and their basis.",
      },
      {
        title: "Percentage",
        symbol: "%",
        description: "A measure of the proportion of a whole.",
        conversions: {
          [systemDataTypes.one.dataTypeBaseUrl]: scaledConversion({
            factor: 0.01,
            divisor: 1,
          }),
        },
      },
      {
        title: "Part per Million",
        titlePlural: "Parts per Million",
        symbol: "ppm",
        description:
          "A dimensionless ratio scaled by one million; the property specifies whether the ratio is by mass, volume, amount, or another basis.",
        conversions: {
          [systemDataTypes.one.dataTypeBaseUrl]: scaledConversion({
            factor: 1e-6,
            divisor: 1,
          }),
        },
      },
      {
        title: "Part per Billion",
        titlePlural: "Parts per Billion",
        symbol: "ppb",
        description:
          "A dimensionless ratio scaled by one billion (10⁹); the property specifies the ratio basis.",
        conversions: {
          [systemDataTypes.one.dataTypeBaseUrl]: scaledConversion({
            factor: 1e-9,
            divisor: 1,
          }),
        },
      },
    ],
  },
  {
    title: "Volume Flow Rate",
    titlePlural: "Volume Flow Rates",
    description:
      "A volume passing through a surface per unit time at the measurement conditions.",
    units: [
      {
        title: "Cubic Meter per Second",
        titlePlural: "Cubic Meters per Second",
        symbol: "m³/s",
        description:
          "The coherent SI unit of volume flow rate at the measurement conditions.",
      },
      {
        title: "Cubic Meter per Hour",
        titlePlural: "Cubic Meters per Hour",
        symbol: "m³/h",
        description:
          "A unit of volume flow rate at the measurement conditions; one unit equals 1/3600 cubic meters per second.",
        conversions: {
          [systemDataTypes.cubicMeterPerSecond.dataTypeBaseUrl]:
            scaledConversion({ factor: 1, divisor: 3600 }),
        },
      },
      {
        title: "Liter per Second",
        titlePlural: "Liters per Second",
        symbol: "L/s",
        description:
          "A unit of volume flow rate at the measurement conditions; one unit equals 0.001/1 cubic meters per second.",
        conversions: {
          [systemDataTypes.cubicMeterPerSecond.dataTypeBaseUrl]:
            scaledConversion({ factor: 0.001, divisor: 1 }),
        },
      },
      {
        title: "Liter per Minute",
        titlePlural: "Liters per Minute",
        symbol: "L/min",
        description:
          "A unit of volume flow rate at the measurement conditions; one unit equals 0.001/60 cubic meters per second.",
        conversions: {
          [systemDataTypes.cubicMeterPerSecond.dataTypeBaseUrl]:
            scaledConversion({ factor: 0.001, divisor: 60 }),
        },
      },
      {
        title: "US Gallon per Minute",
        titlePlural: "US Gallons per Minute",
        symbol: "US gal/min",
        description:
          "A unit of volume flow rate at the measurement conditions; one unit equals 0.003785411784/60 cubic meters per second.",
        systems: ["US Customary"],
        conversions: {
          [systemDataTypes.cubicMeterPerSecond.dataTypeBaseUrl]:
            scaledConversion({ factor: 0.003785411784, divisor: 60 }),
        },
      },
      {
        title: "Imperial Gallon per Minute",
        titlePlural: "Imperial Gallons per Minute",
        symbol: "imp gal/min",
        description:
          "A unit of volume flow rate at the measurement conditions; one unit equals 0.00454609/60 cubic meters per second.",
        systems: ["Imperial"],
        conversions: {
          [systemDataTypes.cubicMeterPerSecond.dataTypeBaseUrl]:
            scaledConversion({ factor: 0.00454609, divisor: 60 }),
        },
      },
      {
        title: "Cubic Foot per Minute",
        titlePlural: "Cubic Feet per Minute",
        symbol: "ft³/min",
        description:
          "A unit of volume flow rate at the measurement conditions; one unit equals 0.028316846592/60 cubic meters per second.",
        systems: ["Imperial", "US Customary"],
        conversions: {
          [systemDataTypes.cubicMeterPerSecond.dataTypeBaseUrl]:
            scaledConversion({ factor: 0.028316846592, divisor: 60 }),
        },
      },
    ],
  },
  {
    title: "Fuel Consumption",
    titlePlural: "Fuel Consumptions",
    description: "The volume of fuel consumed per distance traveled.",
    units: [
      {
        title: "Liter per 100 Kilometers",
        titlePlural: "Liters per 100 Kilometers",
        symbol: "L/100 km",
        description: "A fuel consumption of one liter per 100 kilometers.",
        minimum: 0,
      },
    ],
  },
  {
    title: "Fuel Economy",
    titlePlural: "Fuel Economies",
    description: "The distance traveled per volume of fuel consumed.",
    units: [
      {
        title: "Kilometer per Liter",
        titlePlural: "Kilometers per Liter",
        symbol: "km/L",
        description: "A distance of one kilometer traveled per liter of fuel.",
        minimum: 0,
      },
      {
        title: "Mile per US Gallon",
        titlePlural: "Miles per US Gallon",
        symbol: "mpg (US)",
        description:
          "A distance in international miles per US liquid gallon (3.785411784 liters).",
        systems: ["US Customary"],
        minimum: 0,
        conversions: {
          [systemDataTypes.kilometerPerLiter.dataTypeBaseUrl]: scaledConversion(
            { factor: 1.609344, divisor: 3.785411784 },
          ),
        },
      },
      {
        title: "Mile per Imperial Gallon",
        titlePlural: "Miles per Imperial Gallon",
        symbol: "mpg (imp)",
        description:
          "A distance in international miles per imperial gallon (4.54609 liters).",
        systems: ["Imperial"],
        minimum: 0,
        conversions: {
          [systemDataTypes.kilometerPerLiter.dataTypeBaseUrl]: scaledConversion(
            { factor: 1.609344, divisor: 4.54609 },
          ),
        },
      },
    ],
  },
  {
    title: "Logarithmic Ratio",
    titlePlural: "Logarithmic Ratios",
    description:
      "A logarithmic ratio whose property specifies whether it compares power or field quantities and identifies any reference.",
    units: [
      {
        title: "Bel",
        titlePlural: "Bels",
        symbol: "B",
        description:
          "A logarithmic unit equal to ten decibels; the property specifies the ratio convention and reference.",
      },
      {
        title: "Decibel",
        titlePlural: "Decibels",
        symbol: "dB",
        description:
          "A logarithmic unit equal to one tenth of a bel; the property specifies the ratio convention and reference.",
        conversions: {
          [systemDataTypes.bel.dataTypeBaseUrl]: scaledConversion({
            factor: 0.1,
            divisor: 1,
          }),
        },
      },
    ],
  },
  {
    title: "Power Level",
    titlePlural: "Power Levels",
    description: "A logarithmic power level with a specified reference power.",
    units: [
      {
        title: "Decibel Watt",
        titlePlural: "Decibel Watts",
        symbol: "dBW",
        description:
          "A power level equal to 10 log₁₀(P / 1 watt). Negative levels represent power below one watt.",
      },
      {
        title: "Decibel Milliwatt",
        titlePlural: "Decibel Milliwatts",
        symbol: "dBm",
        description:
          "A power level equal to 10 log₁₀(P / 1 milliwatt), numerically 30 above its value in dBW.",
        conversions: {
          [systemDataTypes.decibelWatt.dataTypeBaseUrl]: affineConversion({
            offset: -30,
          }),
        },
      },
    ],
  },
  {
    title: "Sound Pressure Level",
    titlePlural: "Sound Pressure Levels",
    description:
      "A logarithmic sound pressure level referenced to 20 micropascals, with the frequency weighting specified by the concrete type.",
    units: [
      {
        title: "Decibel (Sound Pressure)",
        titlePlural: "Decibels (Sound Pressure)",
        symbol: "dB SPL",
        description:
          "An unweighted sound pressure level equal to 20 log₁₀(pᵣₘₛ / 20 micropascals).",
      },
      {
        title: "Decibel (A-Weighted Sound Pressure)",
        titlePlural: "Decibels (A-Weighted Sound Pressure)",
        symbol: "dBA",
        description:
          "An A-weighted sound pressure level referenced to 20 micropascals. Conversion to another weighting requires the sound spectrum.",
      },
      {
        title: "Decibel (C-Weighted Sound Pressure)",
        titlePlural: "Decibels (C-Weighted Sound Pressure)",
        symbol: "dBC",
        description:
          "A C-weighted sound pressure level referenced to 20 micropascals. Conversion to another weighting requires the sound spectrum.",
      },
    ],
  },
];

export const commonUnitGroups: SiUnitGroup[] = [
  ...siUnitGroups.map((group) => ({
    ...group,
    units: [...group.units, ...(additionalUnits[group.title] ?? [])],
  })),
  ...additionalGroups,
];

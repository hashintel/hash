import { systemDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { siUnitGroups } from "../034-add-si-unit-data-types/si-unit-groups";
import { affineConversion, scaledConversion } from "../shared/conversions";

import type {
  SiUnitDefinition,
  SiUnitGroup,
} from "../034-add-si-unit-data-types/si-unit-groups";

const additionalUnits: Partial<Record<string, SiUnitDefinition[]>> = {
  "Radionuclide Activity": [
    {
      title: "Curies",
      symbol: "Ci",
      description:
        "A unit of radionuclide activity equal to exactly 37 billion becquerels.",
      conversions: {
        [systemDataTypes.becquerels.dataTypeBaseUrl]: scaledConversion(
          37000000000,
          1,
        ),
      },
    },
  ],
  "Absorbed Dose": [
    {
      title: "Rads",
      symbol: "rad",
      description: "A unit of absorbed radiation dose equal to 0.01 gray.",
      conversions: {
        [systemDataTypes.grays.dataTypeBaseUrl]: scaledConversion(0.01, 1),
      },
    },
  ],
  "Dose Equivalent": [
    {
      title: "Rems",
      symbol: "rem",
      description: "A unit of dose equivalent equal to 0.01 sievert.",
      conversions: {
        [systemDataTypes.sieverts.dataTypeBaseUrl]: scaledConversion(0.01, 1),
      },
    },
  ],
  Length: [
    {
      title: "Nautical Miles",
      symbol: "nmi",
      description:
        "The international nautical mile, equal to exactly 1852 meters.",
      systems: ["Metric", "Imperial"],
      conversions: {
        [systemDataTypes.meters.dataTypeBaseUrl]: scaledConversion(1852, 1),
      },
    },
  ],
  Area: [
    {
      title: "Hectares",
      symbol: "ha",
      description: "A unit of area equal to 10000 square meters.",
      conversions: {
        [systemDataTypes.squareMetres.dataTypeBaseUrl]: scaledConversion(
          10000,
          1,
        ),
      },
    },
  ],
  Mass: [
    {
      title: "Metric Carats",
      symbol: "ct",
      description: "A unit of mass for gemstones equal to exactly 0.2 grams.",
      conversions: {
        [systemDataTypes.kilograms.dataTypeBaseUrl]: scaledConversion(
          0.0002,
          1,
        ),
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
        [systemDataTypes.metersPerSecond.dataTypeBaseUrl]: scaledConversion(
          1852,
          3600,
        ),
      },
    },
  ],
  Pressure: [
    {
      title: "Millibars",
      symbol: "mbar",
      description: "A unit of pressure equal to 100 pascals.",
      conversions: {
        [systemDataTypes.pascals.dataTypeBaseUrl]: scaledConversion(100, 1),
      },
    },
    {
      title: "Torr",
      symbol: "Torr",
      description:
        "A unit of pressure equal to exactly 1/760 of a standard atmosphere.",
      conversions: {
        [systemDataTypes.pascals.dataTypeBaseUrl]: scaledConversion(
          101325,
          760,
        ),
      },
    },
    {
      title: "Millimeters of Mercury (Conventional)",
      symbol: "mmHg",
      description:
        "A conventional pressure unit equal to 133.322387415 pascals, using mercury density 13595.1 kilograms per cubic meter and standard gravity.",
      conversions: {
        [systemDataTypes.pascals.dataTypeBaseUrl]: scaledConversion(
          133.322387415,
          1,
        ),
      },
    },
    {
      title: "Inches of Water (Conventional)",
      symbol: "inH₂O",
      description:
        "A conventional pressure unit equal to 249.08891 pascals, using water density 1000 kilograms per cubic meter and standard gravity.",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.pascals.dataTypeBaseUrl]: scaledConversion(
          249.08891,
          1,
        ),
      },
    },
  ],
  Energy: [
    {
      title: "Electronvolts",
      symbol: "eV",
      description:
        "A unit of energy equal to exactly 1.602176634 × 10⁻¹⁹ joules.",
      conversions: {
        [systemDataTypes.joules.dataTypeBaseUrl]: {
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
      title: "Calories (Thermochemical)",
      symbol: "cal (th)",
      description: "A unit of energy equal to exactly 4.184 joules.",
      conversions: {
        [systemDataTypes.joules.dataTypeBaseUrl]: scaledConversion(4.184, 1),
      },
    },
    {
      title: "Kilocalories (Thermochemical)",
      symbol: "kcal (th)",
      description:
        "A unit of energy equal to exactly 4184 joules. A nutritional Calorie under this definition is one kilocalorie.",
      conversions: {
        [systemDataTypes.joules.dataTypeBaseUrl]: scaledConversion(4184, 1),
      },
    },
    {
      title: "Calories (IT)",
      symbol: "cal (IT)",
      description: "A unit of energy equal to exactly 4.1868 joules.",
      conversions: {
        [systemDataTypes.joules.dataTypeBaseUrl]: scaledConversion(4.1868, 1),
      },
    },
    {
      title: "Kilocalories (IT)",
      symbol: "kcal (IT)",
      description:
        "A unit of energy equal to exactly 4186.8 joules. A nutritional Calorie under this definition is one kilocalorie.",
      conversions: {
        [systemDataTypes.joules.dataTypeBaseUrl]: scaledConversion(4186.8, 1),
      },
    },
    {
      title: "Therms (US)",
      symbol: "therm (US)",
      description: "The US therm, equal to exactly 105480400 joules.",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.joules.dataTypeBaseUrl]: scaledConversion(
          105480400,
          1,
        ),
      },
    },
    {
      title: "Therms (EC)",
      symbol: "therm (EC)",
      description: "The EC therm, equal to exactly 105506000 joules.",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.joules.dataTypeBaseUrl]: scaledConversion(
          105506000,
          1,
        ),
      },
    },
  ],
  Power: [
    {
      title: "Metric Horsepower",
      symbol: "PS",
      description:
        "A unit of power equal to 75 kilogram-force meters per second, or exactly 735.49875 watts.",
      conversions: {
        [systemDataTypes.watts.dataTypeBaseUrl]: scaledConversion(735.49875, 1),
      },
    },
  ],
  Angle: [
    {
      title: "Arcminutes",
      symbol: "′",
      description: "A unit of plane angle equal to 1/60 of a degree.",
      conversions: {
        [systemDataTypes.degree.dataTypeBaseUrl]: scaledConversion(1, 60),
      },
    },
    {
      title: "Arcseconds",
      symbol: "″",
      description: "A unit of plane angle equal to 1/3600 of a degree.",
      conversions: {
        [systemDataTypes.degree.dataTypeBaseUrl]: scaledConversion(1, 3600),
      },
    },
    {
      title: "Revolutions",
      symbol: "rev",
      description: "A complete turn, equal to 360 degrees.",
      conversions: {
        [systemDataTypes.degree.dataTypeBaseUrl]: scaledConversion(360, 1),
      },
    },
  ],
  "Angular Velocity": [
    {
      title: "Revolutions per Second",
      symbol: "rev/s",
      description:
        "An angular velocity of one full turn per second, equal to 2π radians per second.",
      conversions: {
        [systemDataTypes.radiansPerSecond.dataTypeBaseUrl]: scaledConversion(
          2 * Math.PI,
        ),
      },
    },
    {
      title: "Revolutions per Minute",
      symbol: "rpm",
      description:
        "An angular velocity of one full turn per minute, equal to π/30 radians per second.",
      conversions: {
        [systemDataTypes.radiansPerSecond.dataTypeBaseUrl]: scaledConversion(
          Math.PI,
          30,
        ),
      },
    },
  ],
  Acceleration: [
    {
      title: "Standard Gravities",
      symbol: "g₀",
      description:
        "A unit of acceleration equal to the standard acceleration of free fall, exactly 9.80665 meters per second squared.",
      conversions: {
        [systemDataTypes.metersPerSecondSquared.dataTypeBaseUrl]:
          scaledConversion(9.80665, 1),
      },
    },
  ],
  Force: [
    {
      title: "Kilograms-Force",
      symbol: "kgf",
      description:
        "The force exerted on one kilogram under standard gravity, equal to exactly 9.80665 newtons.",
      conversions: {
        [systemDataTypes.newtons.dataTypeBaseUrl]: scaledConversion(9.80665, 1),
      },
    },
  ],
  "Dynamic Viscosity": [
    {
      title: "Poises",
      symbol: "P",
      description:
        "A CGS unit of dynamic viscosity equal to 0.1 pascal seconds.",
      conversions: {
        [systemDataTypes.pascalSeconds.dataTypeBaseUrl]: scaledConversion(
          0.1,
          1,
        ),
      },
    },
    {
      title: "Centipoises",
      symbol: "cP",
      description: "A unit of dynamic viscosity equal to 0.001 pascal seconds.",
      conversions: {
        [systemDataTypes.pascalSeconds.dataTypeBaseUrl]: scaledConversion(
          0.001,
          1,
        ),
      },
    },
  ],
  "Mass Density": [
    {
      title: "Milligrams per Decilitre",
      symbol: "mg/dL",
      description:
        "A unit of mass per volume equal to 0.01 kilograms per cubic meter; used for mass concentration.",
      conversions: {
        [systemDataTypes.kilogramsPerCubicMeter.dataTypeBaseUrl]:
          scaledConversion(0.01, 1),
      },
    },
    {
      title: "Milligrams per Litre",
      symbol: "mg/L",
      description:
        "A unit of mass per volume equal to 0.001 kilograms per cubic meter; used for mass concentration.",
      conversions: {
        [systemDataTypes.kilogramsPerCubicMeter.dataTypeBaseUrl]:
          scaledConversion(0.001, 1),
      },
    },
    {
      title: "Grams per Litre",
      symbol: "g/L",
      description:
        "A unit of mass per volume equal to one kilogram per cubic meter; used for mass concentration.",
      conversions: {
        [systemDataTypes.kilogramsPerCubicMeter.dataTypeBaseUrl]:
          scaledConversion(1, 1),
      },
    },
  ],
  Luminance: [
    {
      title: "Foot-Lamberts",
      symbol: "fL",
      description: "A unit of luminance equal to 1/π candela per square foot.",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.candelasPerSquareMeter.dataTypeBaseUrl]: {
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
    description:
      "A signed difference between two temperatures, converted by scale alone without temperature-reading offsets.",
    units: [
      {
        title: "Kelvin Difference",
        symbol: "K",
        description:
          "A temperature difference expressed in kelvins. Negative values represent a decrease; zero represents no change.",
      },
      {
        title: "Celsius Difference",
        symbol: "°C",
        description:
          "A temperature difference expressed in degrees Celsius. One degree Celsius of difference equals one kelvin of difference, with no offset.",
        conversions: {
          [systemDataTypes.kelvinDifference.dataTypeBaseUrl]:
            scaledConversion(1),
        },
      },
      {
        title: "Fahrenheit Difference",
        systems: ["Imperial"],
        symbol: "°F",
        description:
          "A temperature difference expressed in degrees Fahrenheit. One degree Fahrenheit of difference equals exactly 5/9 kelvin of difference, with no offset.",
        conversions: {
          [systemDataTypes.kelvinDifference.dataTypeBaseUrl]: scaledConversion(
            5,
            9,
          ),
        },
      },
      {
        title: "Rankine Difference",
        systems: ["Imperial"],
        symbol: "°R",
        description:
          "A temperature difference expressed in degrees Rankine. One degree Rankine of difference equals exactly 5/9 kelvin of difference, with no offset.",
        conversions: {
          [systemDataTypes.kelvinDifference.dataTypeBaseUrl]: scaledConversion(
            5,
            9,
          ),
        },
      },
    ],
  },
  {
    title: "Kinematic Viscosity",
    description: "A measure of dynamic viscosity divided by mass density.",
    units: [
      {
        title: "Square Meters per Second",
        symbol: "m²/s",
        description: "The coherent SI unit of kinematic viscosity.",
      },
      {
        title: "Square Millimeters per Second",
        symbol: "mm²/s",
        description:
          "A unit of kinematic viscosity equal to 1e-06 square meters per second.",
        conversions: {
          [systemDataTypes.squareMetersPerSecond.dataTypeBaseUrl]:
            scaledConversion(1e-6, 1),
        },
      },
      {
        title: "Stokes",
        symbol: "St",
        description:
          "A unit of kinematic viscosity equal to 0.0001 square meters per second.",
        conversions: {
          [systemDataTypes.squareMetersPerSecond.dataTypeBaseUrl]:
            scaledConversion(0.0001, 1),
        },
      },
      {
        title: "Centistokes",
        symbol: "cSt",
        description:
          "A unit of kinematic viscosity equal to 1e-06 square meters per second.",
        conversions: {
          [systemDataTypes.squareMetersPerSecond.dataTypeBaseUrl]:
            scaledConversion(1e-6, 1),
        },
      },
    ],
  },
  {
    title: "Dimensionless Ratio",
    description:
      "A numerical ratio whose numerator and denominator have the same quantity kind; the property specifies the basis.",
    units: [
      {
        title: "One",
        symbol: "1",
        description:
          "The unit for a dimensionless ratio; the property specifies the compared quantities and their basis.",
      },
      {
        title: "Percentage",
        symbol: "%",
        description: "A measure of the proportion of a whole.",
        conversions: {
          [systemDataTypes.one.dataTypeBaseUrl]: scaledConversion(0.01, 1),
        },
      },
      {
        title: "Parts per Million",
        symbol: "ppm",
        description:
          "A dimensionless ratio scaled by one million; the property specifies whether the ratio is by mass, volume, amount, or another basis.",
        conversions: {
          [systemDataTypes.one.dataTypeBaseUrl]: scaledConversion(1e-6, 1),
        },
      },
      {
        title: "Parts per Billion",
        symbol: "ppb",
        description:
          "A dimensionless ratio scaled by one billion (10⁹); the property specifies the ratio basis.",
        conversions: {
          [systemDataTypes.one.dataTypeBaseUrl]: scaledConversion(1e-9, 1),
        },
      },
    ],
  },
  {
    title: "Volume Flow Rate",
    description:
      "A volume passing through a surface per unit time at the measurement conditions.",
    units: [
      {
        title: "Cubic Meters per Second",
        symbol: "m³/s",
        description:
          "The coherent SI unit of volume flow rate at the measurement conditions.",
      },
      {
        title: "Cubic Meters per Hour",
        symbol: "m³/h",
        description:
          "A unit of volume flow rate at the measurement conditions; one unit equals 1/3600 cubic meters per second.",
        conversions: {
          [systemDataTypes.cubicMetersPerSecond.dataTypeBaseUrl]:
            scaledConversion(1, 3600),
        },
      },
      {
        title: "Litres per Second",
        symbol: "L/s",
        description:
          "A unit of volume flow rate at the measurement conditions; one unit equals 0.001/1 cubic meters per second.",
        conversions: {
          [systemDataTypes.cubicMetersPerSecond.dataTypeBaseUrl]:
            scaledConversion(0.001, 1),
        },
      },
      {
        title: "Litres per Minute",
        symbol: "L/min",
        description:
          "A unit of volume flow rate at the measurement conditions; one unit equals 0.001/60 cubic meters per second.",
        conversions: {
          [systemDataTypes.cubicMetersPerSecond.dataTypeBaseUrl]:
            scaledConversion(0.001, 60),
        },
      },
      {
        title: "US Gallons per Minute",
        symbol: "US gal/min",
        description:
          "A unit of volume flow rate at the measurement conditions; one unit equals 0.003785411784/60 cubic meters per second.",
        systems: ["US Customary"],
        conversions: {
          [systemDataTypes.cubicMetersPerSecond.dataTypeBaseUrl]:
            scaledConversion(0.003785411784, 60),
        },
      },
      {
        title: "Imperial Gallons per Minute",
        symbol: "imp gal/min",
        description:
          "A unit of volume flow rate at the measurement conditions; one unit equals 0.00454609/60 cubic meters per second.",
        systems: ["Imperial"],
        conversions: {
          [systemDataTypes.cubicMetersPerSecond.dataTypeBaseUrl]:
            scaledConversion(0.00454609, 60),
        },
      },
      {
        title: "Cubic Feet per Minute",
        symbol: "ft³/min",
        description:
          "A unit of volume flow rate at the measurement conditions; one unit equals 0.028316846592/60 cubic meters per second.",
        systems: ["Imperial", "US Customary"],
        conversions: {
          [systemDataTypes.cubicMetersPerSecond.dataTypeBaseUrl]:
            scaledConversion(0.028316846592, 60),
        },
      },
    ],
  },
  {
    title: "Fuel Consumption",
    description: "The volume of fuel consumed per distance traveled.",
    units: [
      {
        title: "Litres per 100 Kilometers",
        symbol: "L/100 km",
        description: "A fuel consumption of one litre per 100 kilometers.",
        minimum: 0,
      },
    ],
  },
  {
    title: "Fuel Economy",
    description: "The distance traveled per volume of fuel consumed.",
    units: [
      {
        title: "Kilometers per Litre",
        symbol: "km/L",
        description: "A distance of one kilometer traveled per litre of fuel.",
        minimum: 0,
      },
      {
        title: "Miles per US Gallon",
        symbol: "mpg (US)",
        description:
          "A distance in international miles per US liquid gallon (3.785411784 litres).",
        systems: ["US Customary"],
        minimum: 0,
        conversions: {
          [systemDataTypes.kilometersPerLitre.dataTypeBaseUrl]:
            scaledConversion(1.609344, 3.785411784),
        },
      },
      {
        title: "Miles per Imperial Gallon",
        symbol: "mpg (imp)",
        description:
          "A distance in international miles per imperial gallon (4.54609 litres).",
        systems: ["Imperial"],
        minimum: 0,
        conversions: {
          [systemDataTypes.kilometersPerLitre.dataTypeBaseUrl]:
            scaledConversion(1.609344, 4.54609),
        },
      },
    ],
  },
  {
    title: "Logarithmic Ratio",
    description:
      "A logarithmic ratio whose property specifies whether it compares power or field quantities and identifies any reference.",
    units: [
      {
        title: "Bels",
        symbol: "B",
        description:
          "A logarithmic unit equal to ten decibels; the property specifies the ratio convention and reference.",
      },
      {
        title: "Decibels",
        symbol: "dB",
        description:
          "A logarithmic unit equal to one tenth of a bel; the property specifies the ratio convention and reference.",
        conversions: {
          [systemDataTypes.bels.dataTypeBaseUrl]: scaledConversion(0.1, 1),
        },
      },
    ],
  },
  {
    title: "Power Level",
    description: "A logarithmic power level with a specified reference power.",
    units: [
      {
        title: "Decibel Watts",
        symbol: "dBW",
        description:
          "A power level equal to 10 log₁₀(P / 1 watt). Negative levels represent power below one watt.",
      },
      {
        title: "Decibel Milliwatts",
        symbol: "dBm",
        description:
          "A power level equal to 10 log₁₀(P / 1 milliwatt), numerically 30 above its value in dBW.",
        conversions: {
          [systemDataTypes.decibelWatts.dataTypeBaseUrl]: affineConversion({
            offset: -30,
          }),
        },
      },
    ],
  },
  {
    title: "Sound Pressure Level",
    description:
      "A logarithmic sound pressure level referenced to 20 micropascals, with the frequency weighting specified by the concrete type.",
    units: [
      {
        title: "Decibels (Sound Pressure)",
        symbol: "dB SPL",
        description:
          "An unweighted sound pressure level equal to 20 log₁₀(pᵣₘₛ / 20 micropascals).",
      },
      {
        title: "Decibels (A-Weighted Sound Pressure)",
        symbol: "dBA",
        description:
          "An A-weighted sound pressure level referenced to 20 micropascals. Conversion to another weighting requires the sound spectrum.",
      },
      {
        title: "Decibels (C-Weighted Sound Pressure)",
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

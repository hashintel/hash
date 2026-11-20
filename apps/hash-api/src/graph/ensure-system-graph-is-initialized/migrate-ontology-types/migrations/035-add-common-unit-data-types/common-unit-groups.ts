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
      dataTypeBaseUrl: systemDataTypes.curies.dataTypeBaseUrl,
      title: "Curie",
      titlePlural: "Curies",
      symbol: "Ci",
      description:
        "A unit of radionuclide activity equal to exactly 37 billion becquerels.",
      conversions: {
        [systemDataTypes.becquerels.dataTypeBaseUrl]: scaledConversion({
          factor: 37000000000,
          divisor: 1,
        }),
      },
    },
  ],
  "Absorbed Dose": [
    {
      dataTypeBaseUrl: systemDataTypes.rads.dataTypeBaseUrl,
      title: "Rad",
      titlePlural: "Rads",
      symbol: "rad",
      description: "A unit of absorbed radiation dose equal to 0.01 gray.",
      conversions: {
        [systemDataTypes.grays.dataTypeBaseUrl]: scaledConversion({
          factor: 0.01,
          divisor: 1,
        }),
      },
    },
  ],
  "Dose Equivalent": [
    {
      dataTypeBaseUrl: systemDataTypes.rems.dataTypeBaseUrl,
      title: "Rem",
      titlePlural: "Rems",
      symbol: "rem",
      description: "A unit of dose equivalent equal to 0.01 sievert.",
      conversions: {
        [systemDataTypes.sieverts.dataTypeBaseUrl]: scaledConversion({
          factor: 0.01,
          divisor: 1,
        }),
      },
    },
  ],
  Length: [
    {
      dataTypeBaseUrl: systemDataTypes.nauticalMiles.dataTypeBaseUrl,
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
      dataTypeBaseUrl: systemDataTypes.hectares.dataTypeBaseUrl,
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
      dataTypeBaseUrl: systemDataTypes.metricCarats.dataTypeBaseUrl,
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
      dataTypeBaseUrl: systemDataTypes.millibars.dataTypeBaseUrl,
      title: "Millibar",
      titlePlural: "Millibars",
      symbol: "mbar",
      description: "A unit of pressure equal to 100 pascals.",
      conversions: {
        [systemDataTypes.pascals.dataTypeBaseUrl]: scaledConversion({
          factor: 100,
          divisor: 1,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.torr.dataTypeBaseUrl,
      title: "Torr",
      titlePlural: "Torrs",
      symbol: "Torr",
      description:
        "A unit of pressure equal to exactly 1/760 of a standard atmosphere.",
      conversions: {
        [systemDataTypes.pascals.dataTypeBaseUrl]: scaledConversion({
          factor: 101325,
          divisor: 760,
        }),
      },
    },
    {
      dataTypeBaseUrl:
        systemDataTypes.millimetersOfMercuryConventional.dataTypeBaseUrl,
      title: "Millimeter of Mercury (Conventional)",
      titlePlural: "Millimeters of Mercury (Conventional)",
      symbol: "mmHg",
      description:
        "A conventional pressure unit equal to 133.322387415 pascals, using mercury density 13595.1 kilograms per cubic meter and standard gravity.",
      conversions: {
        [systemDataTypes.pascals.dataTypeBaseUrl]: scaledConversion({
          factor: 133.322387415,
          divisor: 1,
        }),
      },
    },
    {
      dataTypeBaseUrl:
        systemDataTypes.inchesOfWaterConventional.dataTypeBaseUrl,
      title: "Inch of Water (Conventional)",
      titlePlural: "Inches of Water (Conventional)",
      symbol: "inH₂O",
      description:
        "A conventional pressure unit equal to 249.08891 pascals, using water density 1000 kilograms per cubic meter and standard gravity.",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.pascals.dataTypeBaseUrl]: scaledConversion({
          factor: 249.08891,
          divisor: 1,
        }),
      },
    },
  ],
  Energy: [
    {
      dataTypeBaseUrl: systemDataTypes.electronvolts.dataTypeBaseUrl,
      title: "Electronvolt",
      titlePlural: "Electronvolts",
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
      dataTypeBaseUrl: systemDataTypes.caloriesThermochemical.dataTypeBaseUrl,
      title: "Calorie (Thermochemical)",
      titlePlural: "Calories (Thermochemical)",
      symbol: "cal (th)",
      description: "A unit of energy equal to exactly 4.184 joules.",
      conversions: {
        [systemDataTypes.joules.dataTypeBaseUrl]: scaledConversion({
          factor: 4.184,
          divisor: 1,
        }),
      },
    },
    {
      dataTypeBaseUrl:
        systemDataTypes.kilocaloriesThermochemical.dataTypeBaseUrl,
      title: "Kilocalorie (Thermochemical)",
      titlePlural: "Kilocalories (Thermochemical)",
      symbol: "kcal (th)",
      description:
        "A unit of energy equal to exactly 4184 joules. A nutritional Calorie under this definition is one kilocalorie.",
      conversions: {
        [systemDataTypes.joules.dataTypeBaseUrl]: scaledConversion({
          factor: 4184,
          divisor: 1,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.caloriesIt.dataTypeBaseUrl,
      title: "Calorie (IT)",
      titlePlural: "Calories (IT)",
      symbol: "cal (IT)",
      description: "A unit of energy equal to exactly 4.1868 joules.",
      conversions: {
        [systemDataTypes.joules.dataTypeBaseUrl]: scaledConversion({
          factor: 4.1868,
          divisor: 1,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.kilocaloriesIt.dataTypeBaseUrl,
      title: "Kilocalorie (IT)",
      titlePlural: "Kilocalories (IT)",
      symbol: "kcal (IT)",
      description:
        "A unit of energy equal to exactly 4186.8 joules. A nutritional Calorie under this definition is one kilocalorie.",
      conversions: {
        [systemDataTypes.joules.dataTypeBaseUrl]: scaledConversion({
          factor: 4186.8,
          divisor: 1,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.thermsUs.dataTypeBaseUrl,
      title: "Therm (US)",
      titlePlural: "Therms (US)",
      symbol: "therm (US)",
      description: "The US therm, equal to exactly 105480400 joules.",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.joules.dataTypeBaseUrl]: scaledConversion({
          factor: 105480400,
          divisor: 1,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.thermsEc.dataTypeBaseUrl,
      title: "Therm (EC)",
      titlePlural: "Therms (EC)",
      symbol: "therm (EC)",
      description: "The EC therm, equal to exactly 105506000 joules.",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.joules.dataTypeBaseUrl]: scaledConversion({
          factor: 105506000,
          divisor: 1,
        }),
      },
    },
  ],
  Power: [
    {
      dataTypeBaseUrl: systemDataTypes.metricHorsepower.dataTypeBaseUrl,
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
      dataTypeBaseUrl: systemDataTypes.arcminutes.dataTypeBaseUrl,
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
      dataTypeBaseUrl: systemDataTypes.arcseconds.dataTypeBaseUrl,
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
      dataTypeBaseUrl: systemDataTypes.revolutions.dataTypeBaseUrl,
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
      dataTypeBaseUrl: systemDataTypes.revolutionsPerSecond.dataTypeBaseUrl,
      title: "Revolution per Second",
      titlePlural: "Revolutions per Second",
      symbol: "rev/s",
      description:
        "An angular velocity of one full turn per second, equal to 2π radians per second.",
      conversions: {
        [systemDataTypes.radiansPerSecond.dataTypeBaseUrl]: scaledConversion({
          factor: 2 * Math.PI,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.revolutionsPerMinute.dataTypeBaseUrl,
      title: "Revolution per Minute",
      titlePlural: "Revolutions per Minute",
      symbol: "rpm",
      description:
        "An angular velocity of one full turn per minute, equal to π/30 radians per second.",
      conversions: {
        [systemDataTypes.radiansPerSecond.dataTypeBaseUrl]: scaledConversion({
          factor: Math.PI,
          divisor: 30,
        }),
      },
    },
  ],
  Acceleration: [
    {
      dataTypeBaseUrl: systemDataTypes.standardGravities.dataTypeBaseUrl,
      title: "Standard Gravity",
      titlePlural: "Standard Gravities",
      symbol: "g₀",
      description:
        "A unit of acceleration equal to the standard acceleration of free fall, exactly 9.80665 meters per second squared.",
      conversions: {
        [systemDataTypes.metersPerSecondSquared.dataTypeBaseUrl]:
          scaledConversion({ factor: 9.80665, divisor: 1 }),
      },
    },
  ],
  Force: [
    {
      dataTypeBaseUrl: systemDataTypes.kilogramsForce.dataTypeBaseUrl,
      title: "Kilogram-Force",
      titlePlural: "Kilograms-Force",
      symbol: "kgf",
      description:
        "The force exerted on one kilogram under standard gravity, equal to exactly 9.80665 newtons.",
      conversions: {
        [systemDataTypes.newtons.dataTypeBaseUrl]: scaledConversion({
          factor: 9.80665,
          divisor: 1,
        }),
      },
    },
  ],
  "Dynamic Viscosity": [
    {
      dataTypeBaseUrl: systemDataTypes.poises.dataTypeBaseUrl,
      title: "Poise",
      titlePlural: "Poises",
      symbol: "P",
      description:
        "A CGS unit of dynamic viscosity equal to 0.1 pascal seconds.",
      conversions: {
        [systemDataTypes.pascalSeconds.dataTypeBaseUrl]: scaledConversion({
          factor: 0.1,
          divisor: 1,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.centipoises.dataTypeBaseUrl,
      title: "Centipoise",
      titlePlural: "Centipoises",
      symbol: "cP",
      description: "A unit of dynamic viscosity equal to 0.001 pascal seconds.",
      conversions: {
        [systemDataTypes.pascalSeconds.dataTypeBaseUrl]: scaledConversion({
          factor: 0.001,
          divisor: 1,
        }),
      },
    },
  ],
  "Mass Density": [
    {
      dataTypeBaseUrl: systemDataTypes.milligramsPerDecilitre.dataTypeBaseUrl,
      title: "Milligram per Decilitre",
      titlePlural: "Milligrams per Decilitre",
      symbol: "mg/dL",
      description:
        "A unit of mass per volume equal to 0.01 kilograms per cubic meter; used for mass concentration.",
      conversions: {
        [systemDataTypes.kilogramsPerCubicMeter.dataTypeBaseUrl]:
          scaledConversion({ factor: 0.01, divisor: 1 }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.milligramsPerLitre.dataTypeBaseUrl,
      title: "Milligram per Litre",
      titlePlural: "Milligrams per Litre",
      symbol: "mg/L",
      description:
        "A unit of mass per volume equal to 0.001 kilograms per cubic meter; used for mass concentration.",
      conversions: {
        [systemDataTypes.kilogramsPerCubicMeter.dataTypeBaseUrl]:
          scaledConversion({ factor: 0.001, divisor: 1 }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.gramsPerLitre.dataTypeBaseUrl,
      title: "Gram per Litre",
      titlePlural: "Grams per Litre",
      symbol: "g/L",
      description:
        "A unit of mass per volume equal to one kilogram per cubic meter; used for mass concentration.",
      conversions: {
        [systemDataTypes.kilogramsPerCubicMeter.dataTypeBaseUrl]:
          scaledConversion({ factor: 1, divisor: 1 }),
      },
    },
  ],
  Luminance: [
    {
      dataTypeBaseUrl: systemDataTypes.footLamberts.dataTypeBaseUrl,
      title: "Foot-Lambert",
      titlePlural: "Foot-Lamberts",
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
    titlePlural: "Temperature Differences",
    description:
      "A signed difference between two temperatures, converted by scale alone without temperature-reading offsets.",
    units: [
      {
        dataTypeBaseUrl: systemDataTypes.kelvinDifference.dataTypeBaseUrl,
        title: "Kelvin Difference",
        titlePlural: "Kelvin Differences",
        symbol: "K",
        description:
          "A temperature difference expressed in kelvins. Negative values represent a decrease; zero represents no change.",
      },
      {
        dataTypeBaseUrl: systemDataTypes.celsiusDifference.dataTypeBaseUrl,
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
        dataTypeBaseUrl: systemDataTypes.fahrenheitDifference.dataTypeBaseUrl,
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
        dataTypeBaseUrl: systemDataTypes.rankineDifference.dataTypeBaseUrl,
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
        dataTypeBaseUrl: systemDataTypes.squareMetersPerSecond.dataTypeBaseUrl,
        title: "Square Meter per Second",
        titlePlural: "Square Meters per Second",
        symbol: "m²/s",
        description: "The coherent SI unit of kinematic viscosity.",
      },
      {
        dataTypeBaseUrl:
          systemDataTypes.squareMillimetersPerSecond.dataTypeBaseUrl,
        title: "Square Millimeter per Second",
        titlePlural: "Square Millimeters per Second",
        symbol: "mm²/s",
        description:
          "A unit of kinematic viscosity equal to 1e-06 square meters per second.",
        conversions: {
          [systemDataTypes.squareMetersPerSecond.dataTypeBaseUrl]:
            scaledConversion({ factor: 1e-6, divisor: 1 }),
        },
      },
      {
        dataTypeBaseUrl: systemDataTypes.stokes.dataTypeBaseUrl,
        title: "Stokes",
        titlePlural: "Stokes",
        symbol: "St",
        description:
          "A unit of kinematic viscosity equal to 0.0001 square meters per second.",
        conversions: {
          [systemDataTypes.squareMetersPerSecond.dataTypeBaseUrl]:
            scaledConversion({ factor: 0.0001, divisor: 1 }),
        },
      },
      {
        dataTypeBaseUrl: systemDataTypes.centistokes.dataTypeBaseUrl,
        title: "Centistokes",
        titlePlural: "Centistokes",
        symbol: "cSt",
        description:
          "A unit of kinematic viscosity equal to 1e-06 square meters per second.",
        conversions: {
          [systemDataTypes.squareMetersPerSecond.dataTypeBaseUrl]:
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
        dataTypeBaseUrl: systemDataTypes.one.dataTypeBaseUrl,
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
        dataTypeBaseUrl: systemDataTypes.partsPerMillion.dataTypeBaseUrl,
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
        dataTypeBaseUrl: systemDataTypes.partsPerBillion.dataTypeBaseUrl,
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
        dataTypeBaseUrl: systemDataTypes.cubicMetersPerSecond.dataTypeBaseUrl,
        title: "Cubic Meter per Second",
        titlePlural: "Cubic Meters per Second",
        symbol: "m³/s",
        description:
          "The coherent SI unit of volume flow rate at the measurement conditions.",
      },
      {
        dataTypeBaseUrl: systemDataTypes.cubicMetersPerHour.dataTypeBaseUrl,
        title: "Cubic Meter per Hour",
        titlePlural: "Cubic Meters per Hour",
        symbol: "m³/h",
        description:
          "A unit of volume flow rate at the measurement conditions; one unit equals 1/3600 cubic meters per second.",
        conversions: {
          [systemDataTypes.cubicMetersPerSecond.dataTypeBaseUrl]:
            scaledConversion({ factor: 1, divisor: 3600 }),
        },
      },
      {
        dataTypeBaseUrl: systemDataTypes.litresPerSecond.dataTypeBaseUrl,
        title: "Litre per Second",
        titlePlural: "Litres per Second",
        symbol: "L/s",
        description:
          "A unit of volume flow rate at the measurement conditions; one unit equals 0.001/1 cubic meters per second.",
        conversions: {
          [systemDataTypes.cubicMetersPerSecond.dataTypeBaseUrl]:
            scaledConversion({ factor: 0.001, divisor: 1 }),
        },
      },
      {
        dataTypeBaseUrl: systemDataTypes.litresPerMinute.dataTypeBaseUrl,
        title: "Litre per Minute",
        titlePlural: "Litres per Minute",
        symbol: "L/min",
        description:
          "A unit of volume flow rate at the measurement conditions; one unit equals 0.001/60 cubic meters per second.",
        conversions: {
          [systemDataTypes.cubicMetersPerSecond.dataTypeBaseUrl]:
            scaledConversion({ factor: 0.001, divisor: 60 }),
        },
      },
      {
        dataTypeBaseUrl: systemDataTypes.usGallonsPerMinute.dataTypeBaseUrl,
        title: "US Gallon per Minute",
        titlePlural: "US Gallons per Minute",
        symbol: "US gal/min",
        description:
          "A unit of volume flow rate at the measurement conditions; one unit equals 0.003785411784/60 cubic meters per second.",
        systems: ["US Customary"],
        conversions: {
          [systemDataTypes.cubicMetersPerSecond.dataTypeBaseUrl]:
            scaledConversion({ factor: 0.003785411784, divisor: 60 }),
        },
      },
      {
        dataTypeBaseUrl:
          systemDataTypes.imperialGallonsPerMinute.dataTypeBaseUrl,
        title: "Imperial Gallon per Minute",
        titlePlural: "Imperial Gallons per Minute",
        symbol: "imp gal/min",
        description:
          "A unit of volume flow rate at the measurement conditions; one unit equals 0.00454609/60 cubic meters per second.",
        systems: ["Imperial"],
        conversions: {
          [systemDataTypes.cubicMetersPerSecond.dataTypeBaseUrl]:
            scaledConversion({ factor: 0.00454609, divisor: 60 }),
        },
      },
      {
        dataTypeBaseUrl: systemDataTypes.cubicFeetPerMinute.dataTypeBaseUrl,
        title: "Cubic Foot per Minute",
        titlePlural: "Cubic Feet per Minute",
        symbol: "ft³/min",
        description:
          "A unit of volume flow rate at the measurement conditions; one unit equals 0.028316846592/60 cubic meters per second.",
        systems: ["Imperial", "US Customary"],
        conversions: {
          [systemDataTypes.cubicMetersPerSecond.dataTypeBaseUrl]:
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
        dataTypeBaseUrl: systemDataTypes.litresPer100Kilometers.dataTypeBaseUrl,
        title: "Litre per 100 Kilometers",
        titlePlural: "Litres per 100 Kilometers",
        symbol: "L/100 km",
        description: "A fuel consumption of one litre per 100 kilometers.",
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
        dataTypeBaseUrl: systemDataTypes.kilometersPerLitre.dataTypeBaseUrl,
        title: "Kilometer per Litre",
        titlePlural: "Kilometers per Litre",
        symbol: "km/L",
        description: "A distance of one kilometer traveled per litre of fuel.",
        minimum: 0,
      },
      {
        dataTypeBaseUrl: systemDataTypes.milesPerUsGallon.dataTypeBaseUrl,
        title: "Mile per US Gallon",
        titlePlural: "Miles per US Gallon",
        symbol: "mpg (US)",
        description:
          "A distance in international miles per US liquid gallon (3.785411784 litres).",
        systems: ["US Customary"],
        minimum: 0,
        conversions: {
          [systemDataTypes.kilometersPerLitre.dataTypeBaseUrl]:
            scaledConversion({ factor: 1.609344, divisor: 3.785411784 }),
        },
      },
      {
        dataTypeBaseUrl: systemDataTypes.milesPerImperialGallon.dataTypeBaseUrl,
        title: "Mile per Imperial Gallon",
        titlePlural: "Miles per Imperial Gallon",
        symbol: "mpg (imp)",
        description:
          "A distance in international miles per imperial gallon (4.54609 litres).",
        systems: ["Imperial"],
        minimum: 0,
        conversions: {
          [systemDataTypes.kilometersPerLitre.dataTypeBaseUrl]:
            scaledConversion({ factor: 1.609344, divisor: 4.54609 }),
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
        dataTypeBaseUrl: systemDataTypes.bels.dataTypeBaseUrl,
        title: "Bel",
        titlePlural: "Bels",
        symbol: "B",
        description:
          "A logarithmic unit equal to ten decibels; the property specifies the ratio convention and reference.",
      },
      {
        dataTypeBaseUrl: systemDataTypes.decibels.dataTypeBaseUrl,
        title: "Decibel",
        titlePlural: "Decibels",
        symbol: "dB",
        description:
          "A logarithmic unit equal to one tenth of a bel; the property specifies the ratio convention and reference.",
        conversions: {
          [systemDataTypes.bels.dataTypeBaseUrl]: scaledConversion({
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
        dataTypeBaseUrl: systemDataTypes.decibelWatts.dataTypeBaseUrl,
        title: "Decibel Watt",
        titlePlural: "Decibel Watts",
        symbol: "dBW",
        description:
          "A power level equal to 10 log₁₀(P / 1 watt). Negative levels represent power below one watt.",
      },
      {
        dataTypeBaseUrl: systemDataTypes.decibelMilliwatts.dataTypeBaseUrl,
        title: "Decibel Milliwatt",
        titlePlural: "Decibel Milliwatts",
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
    titlePlural: "Sound Pressure Levels",
    description:
      "A logarithmic sound pressure level referenced to 20 micropascals, with the frequency weighting specified by the concrete type.",
    units: [
      {
        dataTypeBaseUrl: systemDataTypes.decibelsSoundPressure.dataTypeBaseUrl,
        title: "Decibel (Sound Pressure)",
        titlePlural: "Decibels (Sound Pressure)",
        symbol: "dB SPL",
        description:
          "An unweighted sound pressure level equal to 20 log₁₀(pᵣₘₛ / 20 micropascals).",
      },
      {
        dataTypeBaseUrl:
          systemDataTypes.decibelsAWeightedSoundPressure.dataTypeBaseUrl,
        title: "Decibel (A-Weighted Sound Pressure)",
        titlePlural: "Decibels (A-Weighted Sound Pressure)",
        symbol: "dBA",
        description:
          "An A-weighted sound pressure level referenced to 20 micropascals. Conversion to another weighting requires the sound spectrum.",
      },
      {
        dataTypeBaseUrl:
          systemDataTypes.decibelsCWeightedSoundPressure.dataTypeBaseUrl,
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

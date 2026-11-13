import { systemDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { scaledConversion } from "../../shared/conversions";

import type { SiUnitDefinition } from "../si-unit-groups";

export const imperialUnits: Record<string, SiUnitDefinition[]> = {
  Length: [
    {
      title: "Inches",
      description:
        "A unit of length expressed in inches. Based on the international yard of exactly 0.9144 meters.",
      symbol: "in",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.meters.dataTypeBaseUrl]: scaledConversion(0.0254),
      },
    },
    {
      title: "Feet",
      description:
        "A unit of length expressed in feet. Based on the international yard of exactly 0.9144 meters.",
      symbol: "ft",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.meters.dataTypeBaseUrl]: scaledConversion(0.3048),
      },
    },
    {
      title: "Yards",
      description:
        "A unit of length expressed in yards. Based on the international yard of exactly 0.9144 meters.",
      symbol: "yd",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.meters.dataTypeBaseUrl]: scaledConversion(0.9144),
      },
    },
    {
      title: "Miles",
      description:
        "A unit of length expressed in miles. Based on the international yard of exactly 0.9144 meters.",
      symbol: "mi",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.meters.dataTypeBaseUrl]: scaledConversion(1609.344),
      },
    },
    {
      title: "Thousandths of an Inch",
      description:
        "A unit of length expressed in thousandths of an inch. Based on the international yard of exactly 0.9144 meters.",
      symbol: "thou",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.meters.dataTypeBaseUrl]: scaledConversion(2.54e-5),
      },
    },
    {
      title: "Hands",
      description:
        "A unit of length expressed in hands. Based on the international yard of exactly 0.9144 meters.",
      symbol: "hh",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.meters.dataTypeBaseUrl]: scaledConversion(0.1016),
      },
    },
    {
      title: "Links",
      description:
        "A unit of length expressed in links. Based on the international yard of exactly 0.9144 meters.",
      symbol: "li",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.meters.dataTypeBaseUrl]: scaledConversion(0.201168),
      },
    },
    {
      title: "Rods",
      description:
        "A unit of length expressed in rods. Based on the international yard of exactly 0.9144 meters.",
      symbol: "rd",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.meters.dataTypeBaseUrl]: scaledConversion(5.0292),
      },
    },
    {
      title: "Chains",
      description:
        "A unit of length expressed in chains. Based on the international yard of exactly 0.9144 meters.",
      symbol: "ch",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.meters.dataTypeBaseUrl]: scaledConversion(20.1168),
      },
    },
    {
      title: "Furlongs",
      description:
        "A unit of length expressed in furlongs. Based on the international yard of exactly 0.9144 meters.",
      symbol: "fur",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.meters.dataTypeBaseUrl]: scaledConversion(201.168),
      },
    },
    {
      title: "Fathoms",
      description:
        "A unit of length expressed in fathoms. Based on the international yard of exactly 0.9144 meters.",
      symbol: "ftm",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.meters.dataTypeBaseUrl]: scaledConversion(1.8288),
      },
    },
  ],
  Mass: [
    {
      title: "Pounds",
      description: "A unit of mass expressed in pounds. Uses avoirdupois mass.",
      symbol: "lb",
      systems: ["Imperial", "US Customary"],
      conversions: {
        [systemDataTypes.kilograms.dataTypeBaseUrl]:
          scaledConversion(0.45359237),
      },
    },
    {
      title: "Ounces",
      description: "A unit of mass expressed in ounces. Uses avoirdupois mass.",
      symbol: "oz",
      systems: ["Imperial", "US Customary"],
      conversions: {
        [systemDataTypes.kilograms.dataTypeBaseUrl]:
          scaledConversion(0.028349523125),
      },
    },
    {
      title: "Stones",
      description: "A unit of mass expressed in stones.",
      symbol: "st",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.kilograms.dataTypeBaseUrl]:
          scaledConversion(6.35029318),
      },
    },
    {
      title: "Grains",
      description: "A unit of mass expressed in grains.",
      symbol: "gr",
      systems: ["Imperial", "US Customary"],
      conversions: {
        [systemDataTypes.kilograms.dataTypeBaseUrl]:
          scaledConversion(6.479891e-5),
      },
    },
    {
      title: "Long Hundredweights",
      description: "A unit of mass expressed in long hundredweights.",
      symbol: "cwt (UK)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.kilograms.dataTypeBaseUrl]:
          scaledConversion(50.80234544),
      },
    },
    {
      title: "Long Tons",
      description: "A unit of mass expressed in long tons.",
      symbol: "long ton",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.kilograms.dataTypeBaseUrl]:
          scaledConversion(1016.0469088),
      },
    },
    {
      title: "Troy Ounces",
      description: "A unit of mass expressed in troy ounces.",
      symbol: "oz t",
      systems: ["Imperial", "US Customary"],
      conversions: {
        [systemDataTypes.kilograms.dataTypeBaseUrl]:
          scaledConversion(0.0311034768),
      },
    },
    {
      title: "Troy Pounds",
      description: "A unit of mass expressed in troy pounds.",
      symbol: "lb t",
      systems: ["Imperial", "US Customary"],
      conversions: {
        [systemDataTypes.kilograms.dataTypeBaseUrl]:
          scaledConversion(0.3732417216),
      },
    },
    {
      title: "Pennyweights",
      description: "A unit of mass expressed in pennyweights.",
      symbol: "dwt",
      systems: ["Imperial", "US Customary"],
      conversions: {
        [systemDataTypes.kilograms.dataTypeBaseUrl]:
          scaledConversion(0.00155517384),
      },
    },
    {
      title: "Slugs",
      description: "A unit of mass expressed in slugs.",
      symbol: "slug",
      systems: ["Imperial", "US Customary"],
      conversions: {
        [systemDataTypes.kilograms.dataTypeBaseUrl]: scaledConversion(
          4.4482216152605,
          0.3048,
        ),
      },
    },
    {
      title: "Short Hundredweights",
      description: "A unit of mass expressed in short hundredweights.",
      symbol: "cwt (US)",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.kilograms.dataTypeBaseUrl]:
          scaledConversion(45.359237),
      },
    },
    {
      title: "Short Tons",
      description: "A unit of mass expressed in short tons.",
      symbol: "short ton",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.kilograms.dataTypeBaseUrl]:
          scaledConversion(907.18474),
      },
    },
  ],
  Area: [
    {
      title: "Square Inches",
      description:
        "A unit of area expressed in square inches. Based on the international foot of exactly 0.3048 meters.",
      symbol: "in²",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.squareMetres.dataTypeBaseUrl]:
          scaledConversion(0.00064516),
      },
    },
    {
      title: "Square Feet",
      description:
        "A unit of area expressed in square feet. Based on the international foot of exactly 0.3048 meters.",
      symbol: "ft²",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.squareMetres.dataTypeBaseUrl]:
          scaledConversion(0.09290304),
      },
    },
    {
      title: "Square Yards",
      description:
        "A unit of area expressed in square yards. Based on the international foot of exactly 0.3048 meters.",
      symbol: "yd²",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.squareMetres.dataTypeBaseUrl]:
          scaledConversion(0.83612736),
      },
    },
    {
      title: "Square Miles",
      description:
        "A unit of area expressed in square miles. Based on the international foot of exactly 0.3048 meters.",
      symbol: "mi²",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.squareMetres.dataTypeBaseUrl]:
          scaledConversion(2589988.110336),
      },
    },
    {
      title: "Acres",
      description:
        "A unit of area expressed in acres. Based on the international foot of exactly 0.3048 meters.",
      symbol: "ac",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.squareMetres.dataTypeBaseUrl]:
          scaledConversion(4046.8564224),
      },
    },
    {
      title: "Roods",
      description:
        "A unit of area expressed in roods. Based on the international foot of exactly 0.3048 meters.",
      symbol: "rood",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.squareMetres.dataTypeBaseUrl]:
          scaledConversion(1011.7141056),
      },
    },
  ],
  Volume: [
    {
      title: "Cubic Inches",
      description: "A unit of volume expressed in cubic inches.",
      symbol: "in³",
      systems: ["Imperial", "US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion(0.016387064),
      },
    },
    {
      title: "Cubic Feet",
      description: "A unit of volume expressed in cubic feet.",
      symbol: "ft³",
      systems: ["Imperial", "US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]:
          scaledConversion(28.316846592),
      },
    },
    {
      title: "Cubic Yards",
      description: "A unit of volume expressed in cubic yards.",
      symbol: "yd³",
      systems: ["Imperial", "US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]:
          scaledConversion(764.554857984),
      },
    },
    {
      title: "Imperial Gallons",
      description: "A unit of volume expressed in imperial gallons.",
      symbol: "gal (UK)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion(4.54609),
      },
    },
    {
      title: "Imperial Quarts",
      description: "A unit of volume expressed in imperial quarts.",
      symbol: "qt (UK)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion(1.1365225),
      },
    },
    {
      title: "Imperial Pints",
      description: "A unit of volume expressed in imperial pints.",
      symbol: "pt (UK)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion(0.56826125),
      },
    },
    {
      title: "Imperial Gills",
      description: "A unit of volume expressed in imperial gills.",
      symbol: "gi (UK)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]:
          scaledConversion(0.1420653125),
      },
    },
    {
      title: "Imperial Fluid Ounces",
      description: "A unit of volume expressed in imperial fluid ounces.",
      symbol: "fl oz (UK)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]:
          scaledConversion(0.0284130625),
      },
    },
    {
      title: "Imperial Bushels",
      description: "A unit of volume expressed in imperial bushels.",
      symbol: "bu (UK)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion(36.36872),
      },
    },
    {
      title: "Imperial Pecks",
      description: "A unit of volume expressed in imperial pecks.",
      symbol: "pk (UK)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion(9.09218),
      },
    },
    {
      title: "US Liquid Gallons",
      description: "A unit of volume expressed in us liquid gallons.",
      symbol: "gal (US)",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion(3.785411784),
      },
    },
    {
      title: "US Liquid Quarts",
      description: "A unit of volume expressed in us liquid quarts.",
      symbol: "qt (US)",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion(0.946352946),
      },
    },
    {
      title: "US Liquid Pints",
      description: "A unit of volume expressed in us liquid pints.",
      symbol: "pt (US)",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion(0.473176473),
      },
    },
    {
      title: "US Cups",
      description:
        "A US customary cup, equal to 8 US fluid ounces or 236.5882365 millilitres.",
      symbol: "cup (US)",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]:
          scaledConversion(0.2365882365),
      },
    },
    {
      title: "US Fluid Ounces",
      description: "A unit of volume expressed in us fluid ounces.",
      symbol: "fl oz (US)",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]:
          scaledConversion(0.0295735295625),
      },
    },
    {
      title: "US Tablespoons",
      description: "A unit of volume expressed in us tablespoons.",
      symbol: "tbsp (US)",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]:
          scaledConversion(0.01478676478125),
      },
    },
    {
      title: "US Teaspoons",
      description: "A unit of volume expressed in us teaspoons.",
      symbol: "tsp (US)",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]:
          scaledConversion(0.00492892159375),
      },
    },
    {
      title: "US Dry Gallons",
      description: "A unit of volume expressed in us dry gallons.",
      symbol: "dry gal (US)",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]:
          scaledConversion(4.40488377086),
      },
    },
    {
      title: "US Dry Quarts",
      description: "A unit of volume expressed in us dry quarts.",
      symbol: "dry qt (US)",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]:
          scaledConversion(1.101220942715),
      },
    },
    {
      title: "US Dry Pints",
      description: "A unit of volume expressed in us dry pints.",
      symbol: "dry pt (US)",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]:
          scaledConversion(0.5506104713575),
      },
    },
    {
      title: "US Bushels",
      description: "A unit of volume expressed in us bushels.",
      symbol: "bu (US)",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]:
          scaledConversion(35.23907016688),
      },
    },
    {
      title: "US Pecks",
      description: "A unit of volume expressed in us pecks.",
      symbol: "pk (US)",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]:
          scaledConversion(8.80976754172),
      },
    },
    {
      title: "Petroleum Barrels",
      description: "A petroleum barrel, equal to 42 US liquid gallons.",
      symbol: "bbl",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]:
          scaledConversion(158.987294928),
      },
    },
  ],
  Temperature: [
    {
      title: "Degrees Rankine",
      description:
        "A unit of absolute temperature with the same scale interval as degrees Fahrenheit.",
      symbol: "°R",
      systems: ["Imperial"],
      minimum: 0,
      conversions: {
        [systemDataTypes.kelvins.dataTypeBaseUrl]: scaledConversion(5.0, 9.0),
      },
    },
  ],
  Force: [
    {
      title: "Pounds-Force",
      description: "A unit of force expressed in pounds-force.",
      symbol: "lbf",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.newtons.dataTypeBaseUrl]:
          scaledConversion(4.4482216152605),
      },
    },
    {
      title: "Ounces-Force",
      description: "A unit of force expressed in ounces-force.",
      symbol: "ozf",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.newtons.dataTypeBaseUrl]: scaledConversion(
          4.4482216152605,
          16.0,
        ),
      },
    },
    {
      title: "Kips",
      description: "A unit of force expressed in kips.",
      symbol: "kip",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.newtons.dataTypeBaseUrl]:
          scaledConversion(4448.2216152605),
      },
    },
    {
      title: "Poundals",
      description: "A unit of force expressed in poundals.",
      symbol: "pdl",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.newtons.dataTypeBaseUrl]:
          scaledConversion(0.138254954376),
      },
    },
  ],
  Pressure: [
    {
      title: "Pounds-Force per Square Inch",
      description:
        "A unit of pressure expressed in pounds-force per square inch.",
      symbol: "psi",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.pascals.dataTypeBaseUrl]: scaledConversion(
          4.4482216152605,
          0.00064516,
        ),
      },
    },
    {
      title: "Pounds-Force per Square Foot",
      description:
        "A unit of pressure expressed in pounds-force per square foot.",
      symbol: "psf",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.pascals.dataTypeBaseUrl]: scaledConversion(
          4.4482216152605,
          0.09290304,
        ),
      },
    },
    {
      title: "Kips per Square Inch",
      description: "A unit of pressure expressed in kips per square inch.",
      symbol: "ksi",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.pascals.dataTypeBaseUrl]: scaledConversion(
          4448.2216152605,
          0.00064516,
        ),
      },
    },
  ],
  Energy: [
    {
      title: "British Thermal Units (IT)",
      description:
        "A unit of energy expressed in british thermal units (it). Uses the International Table British thermal unit, equal to 1055.05585262 joules.",
      symbol: "Btu (IT)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.joules.dataTypeBaseUrl]:
          scaledConversion(1055.05585262),
      },
    },
    {
      title: "British Thermal Units (Thermochemical)",
      description:
        "A unit of energy expressed in british thermal units (thermochemical). Uses the thermochemical calorie of exactly 4.184 joules.",
      symbol: "Btu (th)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.joules.dataTypeBaseUrl]: scaledConversion(
          9489.1523804,
          9.0,
        ),
      },
    },
    {
      title: "Foot Pounds-Force",
      description: "A unit of energy expressed in foot pounds-force.",
      symbol: "ft·lbf",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.joules.dataTypeBaseUrl]:
          scaledConversion(1.3558179483314003),
      },
    },
    {
      title: "Inch Pounds-Force",
      description: "A unit of energy expressed in inch pounds-force.",
      symbol: "in·lbf",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.joules.dataTypeBaseUrl]:
          scaledConversion(0.1129848290276167),
      },
    },
  ],
  Power: [
    {
      title: "Mechanical Horsepower",
      description: "A unit of power expressed in mechanical horsepower.",
      symbol: "hp",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.watts.dataTypeBaseUrl]:
          scaledConversion(745.6998715822702),
      },
    },
    {
      title: "British Thermal Units (IT) per Hour",
      description:
        "A unit of power expressed in british thermal units (it) per hour. Uses the International Table British thermal unit, equal to 1055.05585262 joules.",
      symbol: "Btu (IT)/h",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.watts.dataTypeBaseUrl]: scaledConversion(
          1055.05585262,
          3600.0,
        ),
      },
    },
    {
      title: "British Thermal Units (IT) per Second",
      description:
        "A unit of power expressed in british thermal units (it) per second. Uses the International Table British thermal unit, equal to 1055.05585262 joules.",
      symbol: "Btu (IT)/s",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.watts.dataTypeBaseUrl]:
          scaledConversion(1055.05585262),
      },
    },
    {
      title: "Foot Pounds-Force per Second",
      description: "A unit of power expressed in foot pounds-force per second.",
      symbol: "ft·lbf/s",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.watts.dataTypeBaseUrl]:
          scaledConversion(1.3558179483314003),
      },
    },
  ],
  Speed: [
    {
      title: "Feet per Second",
      description: "A unit of speed expressed in feet per second.",
      symbol: "ft/s",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.metersPerSecond.dataTypeBaseUrl]:
          scaledConversion(0.3048),
      },
    },
    {
      title: "Feet per Minute",
      description: "A unit of speed expressed in feet per minute.",
      symbol: "ft/min",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.metersPerSecond.dataTypeBaseUrl]:
          scaledConversion(0.00508),
      },
    },
    {
      title: "Inches per Second",
      description: "A unit of speed expressed in inches per second.",
      symbol: "in/s",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.metersPerSecond.dataTypeBaseUrl]:
          scaledConversion(0.0254),
      },
    },
    {
      title: "Miles per Hour",
      description: "A unit of speed expressed in miles per hour.",
      symbol: "mph",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.metersPerSecond.dataTypeBaseUrl]:
          scaledConversion(0.44704),
      },
    },
  ],
  Acceleration: [
    {
      title: "Feet per Second Squared",
      description:
        "A unit of acceleration expressed in feet per second squared.",
      symbol: "ft/s²",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.metersPerSecondSquared.dataTypeBaseUrl]:
          scaledConversion(0.3048),
      },
    },
    {
      title: "Inches per Second Squared",
      description:
        "A unit of acceleration expressed in inches per second squared.",
      symbol: "in/s²",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.metersPerSecondSquared.dataTypeBaseUrl]:
          scaledConversion(0.0254),
      },
    },
  ],
  Wavenumber: [
    {
      title: "Reciprocal Feet",
      description: "A unit of wavenumber expressed in reciprocal feet.",
      symbol: "ft⁻¹",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.reciprocalMeters.dataTypeBaseUrl]: scaledConversion(
          1.0,
          0.3048,
        ),
      },
    },
    {
      title: "Reciprocal Inches",
      description: "A unit of wavenumber expressed in reciprocal inches.",
      symbol: "in⁻¹",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.reciprocalMeters.dataTypeBaseUrl]: scaledConversion(
          1.0,
          0.0254,
        ),
      },
    },
  ],
  "Mass Density": [
    {
      title: "Pounds per Cubic Foot",
      description: "A unit of mass density expressed in pounds per cubic foot.",
      symbol: "lb/ft³",
      systems: ["Imperial", "US Customary"],
      conversions: {
        [systemDataTypes.kilogramsPerCubicMeter.dataTypeBaseUrl]:
          scaledConversion(0.45359237, 0.028316846592),
      },
    },
    {
      title: "Pounds per Cubic Inch",
      description: "A unit of mass density expressed in pounds per cubic inch.",
      symbol: "lb/in³",
      systems: ["Imperial", "US Customary"],
      conversions: {
        [systemDataTypes.kilogramsPerCubicMeter.dataTypeBaseUrl]:
          scaledConversion(0.45359237, 1.6387064e-5),
      },
    },
    {
      title: "Pounds per Cubic Yard",
      description: "A unit of mass density expressed in pounds per cubic yard.",
      symbol: "lb/yd³",
      systems: ["Imperial", "US Customary"],
      conversions: {
        [systemDataTypes.kilogramsPerCubicMeter.dataTypeBaseUrl]:
          scaledConversion(0.45359237, 0.764554857984),
      },
    },
    {
      title: "Pounds per Imperial Gallon",
      description:
        "A unit of mass density expressed in pounds per imperial gallon.",
      symbol: "lb/gal (UK)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.kilogramsPerCubicMeter.dataTypeBaseUrl]:
          scaledConversion(0.45359237, 0.00454609),
      },
    },
    {
      title: "Pounds per US Liquid Gallon",
      description:
        "A unit of mass density expressed in pounds per us liquid gallon.",
      symbol: "lb/gal (US)",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.kilogramsPerCubicMeter.dataTypeBaseUrl]:
          scaledConversion(0.45359237, 0.003785411784),
      },
    },
  ],
  "Surface Density": [
    {
      title: "Pounds per Square Foot",
      description:
        "A unit of surface density expressed in pounds per square foot.",
      symbol: "lb/ft²",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.kilogramsPerSquareMeter.dataTypeBaseUrl]:
          scaledConversion(0.45359237, 0.09290304),
      },
    },
    {
      title: "Ounces per Square Yard",
      description:
        "A unit of surface density expressed in ounces per square yard.",
      symbol: "oz/yd²",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.kilogramsPerSquareMeter.dataTypeBaseUrl]:
          scaledConversion(0.028349523125, 0.83612736),
      },
    },
  ],
  "Specific Volume": [
    {
      title: "Cubic Feet per Pound",
      description:
        "A unit of specific volume expressed in cubic feet per pound.",
      symbol: "ft³/lb",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.cubicMetersPerKilogram.dataTypeBaseUrl]:
          scaledConversion(0.028316846592, 0.45359237),
      },
    },
  ],
  "Amount of Substance": [
    {
      title: "Pound Moles",
      description: "A unit of amount of substance expressed in pound moles.",
      symbol: "lbmol",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.moles.dataTypeBaseUrl]: scaledConversion(453.59237),
      },
    },
  ],
  "Amount Concentration": [
    {
      title: "Pound Moles per Cubic Foot",
      description:
        "A unit of amount concentration expressed in pound moles per cubic foot.",
      symbol: "lbmol/ft³",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.molesPerCubicMeter.dataTypeBaseUrl]: scaledConversion(
          453.59237,
          0.028316846592,
        ),
      },
    },
  ],
  Illuminance: [
    {
      title: "Foot-Candles",
      description: "Illuminance of one lumen per square international foot.",
      symbol: "fc",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.lux.dataTypeBaseUrl]: scaledConversion(
          1.0,
          0.09290304,
        ),
      },
    },
  ],
  Luminance: [
    {
      title: "Candelas per Square Foot",
      description: "A unit of luminance expressed in candelas per square foot.",
      symbol: "cd/ft²",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.candelasPerSquareMeter.dataTypeBaseUrl]:
          scaledConversion(1.0, 0.09290304),
      },
    },
    {
      title: "Candelas per Square Inch",
      description: "A unit of luminance expressed in candelas per square inch.",
      symbol: "cd/in²",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.candelasPerSquareMeter.dataTypeBaseUrl]:
          scaledConversion(1.0, 0.00064516),
      },
    },
  ],
  "Dynamic Viscosity": [
    {
      title: "Pounds-Force Seconds per Square Foot",
      description:
        "A unit of dynamic viscosity expressed in pounds-force seconds per square foot.",
      symbol: "lbf·s/ft²",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.pascalSeconds.dataTypeBaseUrl]: scaledConversion(
          4.4482216152605,
          0.09290304,
        ),
      },
    },
    {
      title: "Pounds-Force Seconds per Square Inch",
      description:
        "A unit of dynamic viscosity expressed in pounds-force seconds per square inch.",
      symbol: "lbf·s/in²",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.pascalSeconds.dataTypeBaseUrl]: scaledConversion(
          4.4482216152605,
          0.00064516,
        ),
      },
    },
    {
      title: "Pounds per Foot Second",
      description:
        "A unit of dynamic viscosity expressed in pounds per foot second.",
      symbol: "lb/(ft·s)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.pascalSeconds.dataTypeBaseUrl]: scaledConversion(
          0.45359237,
          0.3048,
        ),
      },
    },
  ],
  Torque: [
    {
      title: "Pound-Force Feet",
      description: "A unit of torque expressed in pound-force feet.",
      symbol: "lbf·ft",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.newtonMeters.dataTypeBaseUrl]:
          scaledConversion(1.3558179483314003),
      },
    },
    {
      title: "Pound-Force Inches",
      description: "A unit of torque expressed in pound-force inches.",
      symbol: "lbf·in",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.newtonMeters.dataTypeBaseUrl]:
          scaledConversion(0.1129848290276167),
      },
    },
    {
      title: "Ounce-Force Inches",
      description: "A unit of torque expressed in ounce-force inches.",
      symbol: "ozf·in",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.newtonMeters.dataTypeBaseUrl]:
          scaledConversion(0.0070615518142260435),
      },
    },
  ],
  "Surface Tension": [
    {
      title: "Pounds-Force per Foot",
      description:
        "A unit of surface tension expressed in pounds-force per foot.",
      symbol: "lbf/ft",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.newtonsPerMeter.dataTypeBaseUrl]: scaledConversion(
          4.4482216152605,
          0.3048,
        ),
      },
    },
    {
      title: "Pounds-Force per Inch",
      description:
        "A unit of surface tension expressed in pounds-force per inch.",
      symbol: "lbf/in",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.newtonsPerMeter.dataTypeBaseUrl]: scaledConversion(
          4.4482216152605,
          0.0254,
        ),
      },
    },
  ],
  "Heat Flux Density": [
    {
      title: "British Thermal Units (IT) per Square Foot Hour",
      description:
        "A unit of heat flux density expressed in british thermal units (it) per square foot hour. Uses the International Table British thermal unit, equal to 1055.05585262 joules.",
      symbol: "Btu (IT)/(ft²·h)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.wattsPerSquareMeter.dataTypeBaseUrl]: scaledConversion(
          1055.05585262,
          334.450944,
        ),
      },
    },
  ],
  "Heat Capacity": [
    {
      title: "British Thermal Units (IT) per Degree Rankine",
      description:
        "A unit of heat capacity expressed in british thermal units (it) per degree rankine. Uses the International Table British thermal unit, equal to 1055.05585262 joules. Each degree Rankine in the denominator represents a temperature interval of 5/9 kelvin.",
      symbol: "Btu (IT)/°R",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.joulesPerKelvin.dataTypeBaseUrl]:
          scaledConversion(1899.100534716),
      },
    },
  ],
  "Specific Heat Capacity": [
    {
      title: "British Thermal Units (IT) per Pound Degree Rankine",
      description:
        "A unit of specific heat capacity expressed in british thermal units (it) per pound degree rankine. Uses the International Table British thermal unit, equal to 1055.05585262 joules. Each degree Rankine in the denominator represents a temperature interval of 5/9 kelvin.",
      symbol: "Btu (IT)/(lb·°R)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.joulesPerKilogramKelvin.dataTypeBaseUrl]:
          scaledConversion(4186.8),
      },
    },
  ],
  "Specific Energy": [
    {
      title: "British Thermal Units (IT) per Pound",
      description:
        "A unit of specific energy expressed in british thermal units (it) per pound. Uses the International Table British thermal unit, equal to 1055.05585262 joules.",
      symbol: "Btu (IT)/lb",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.joulesPerKilogram.dataTypeBaseUrl]: scaledConversion(
          1055.05585262,
          0.45359237,
        ),
      },
    },
  ],
  "Thermal Conductivity": [
    {
      title: "British Thermal Units (IT) per Hour Foot Degree Rankine",
      description:
        "A unit of thermal conductivity expressed in british thermal units (it) per hour foot degree rankine. Uses the International Table British thermal unit, equal to 1055.05585262 joules. Each degree Rankine in the denominator represents a temperature interval of 5/9 kelvin.",
      symbol: "Btu (IT)/(h·ft·°R)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.wattsPerMeterKelvin.dataTypeBaseUrl]: scaledConversion(
          1055.05585262,
          609.6,
        ),
      },
    },
  ],
  "Energy Density": [
    {
      title: "British Thermal Units (IT) per Cubic Foot",
      description:
        "A unit of energy density expressed in british thermal units (it) per cubic foot. Uses the International Table British thermal unit, equal to 1055.05585262 joules.",
      symbol: "Btu (IT)/ft³",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.joulesPerCubicMeter.dataTypeBaseUrl]: scaledConversion(
          1055.05585262,
          0.028316846592,
        ),
      },
    },
  ],
  "Molar Energy": [
    {
      title: "British Thermal Units (IT) per Pound Mole",
      description:
        "A unit of molar energy expressed in british thermal units (it) per pound mole. Uses the International Table British thermal unit, equal to 1055.05585262 joules.",
      symbol: "Btu (IT)/lbmol",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.joulesPerMole.dataTypeBaseUrl]: scaledConversion(
          1055.05585262,
          453.59237,
        ),
      },
    },
  ],
  "Molar Heat Capacity": [
    {
      title: "British Thermal Units (IT) per Pound Mole Degree Rankine",
      description:
        "A unit of molar heat capacity expressed in british thermal units (it) per pound mole degree rankine. Uses the International Table British thermal unit, equal to 1055.05585262 joules. Each degree Rankine in the denominator represents a temperature interval of 5/9 kelvin.",
      symbol: "Btu (IT)/(lbmol·°R)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.joulesPerMoleKelvin.dataTypeBaseUrl]:
          scaledConversion(4.1868),
      },
    },
  ],
  "Electric Current Density": [
    {
      title: "Amperes per Square Foot",
      description:
        "A unit of electric current density expressed in amperes per square foot.",
      symbol: "A/ft²",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.amperesPerSquareMeter.dataTypeBaseUrl]:
          scaledConversion(1.0, 0.09290304),
      },
    },
  ],
  "Magnetic Field Strength": [
    {
      title: "Amperes per Foot",
      description:
        "A unit of magnetic field strength expressed in amperes per foot.",
      symbol: "A/ft",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.amperesPerMeter.dataTypeBaseUrl]: scaledConversion(
          1.0,
          0.3048,
        ),
      },
    },
  ],
  "Electric Field Strength": [
    {
      title: "Volts per Foot",
      description:
        "A unit of electric field strength expressed in volts per foot.",
      symbol: "V/ft",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.voltsPerMeter.dataTypeBaseUrl]: scaledConversion(
          1.0,
          0.3048,
        ),
      },
    },
  ],
  "Electric Charge Density": [
    {
      title: "Coulombs per Cubic Foot",
      description:
        "A unit of electric charge density expressed in coulombs per cubic foot.",
      symbol: "C/ft³",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.coulombsPerCubicMeter.dataTypeBaseUrl]:
          scaledConversion(1.0, 0.028316846592),
      },
    },
  ],
  "Surface Charge Density": [
    {
      title: "Coulombs per Square Foot",
      description:
        "A unit of surface charge density expressed in coulombs per square foot.",
      symbol: "C/ft²",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.coulombsPerSquareMeter.dataTypeBaseUrl]:
          scaledConversion(1.0, 0.09290304),
      },
    },
  ],
  Permittivity: [
    {
      title: "Farads per Foot",
      description: "A unit of permittivity expressed in farads per foot.",
      symbol: "F/ft",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.faradsPerMeter.dataTypeBaseUrl]: scaledConversion(
          1.0,
          0.3048,
        ),
      },
    },
  ],
  "Magnetic Permeability": [
    {
      title: "Henries per Foot",
      description:
        "A unit of magnetic permeability expressed in henries per foot.",
      symbol: "H/ft",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.henriesPerMeter.dataTypeBaseUrl]: scaledConversion(
          1.0,
          0.3048,
        ),
      },
    },
  ],
  "Radiation Exposure": [
    {
      title: "Coulombs per Pound",
      description:
        "A unit of radiation exposure expressed in coulombs per pound.",
      symbol: "C/lb",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.coulombsPerKilogram.dataTypeBaseUrl]: scaledConversion(
          1.0,
          0.45359237,
        ),
      },
    },
  ],
  Radiance: [
    {
      title: "Watts per Square Foot Steradian",
      description:
        "A unit of radiance expressed in watts per square foot steradian.",
      symbol: "W/(ft²·sr)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.wattsPerSquareMeterSteradian.dataTypeBaseUrl]:
          scaledConversion(1.0, 0.09290304),
      },
    },
  ],
  "Catalytic Activity Concentration": [
    {
      title: "Katals per Cubic Foot",
      description:
        "A unit of catalytic activity concentration expressed in katals per cubic foot.",
      symbol: "kat/ft³",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.katalsPerCubicMeter.dataTypeBaseUrl]: scaledConversion(
          1.0,
          0.028316846592,
        ),
      },
    },
  ],
};

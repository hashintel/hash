import { systemDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { scaledConversion } from "../../shared/conversions";

import type { SiUnitDefinition } from "../si-unit-groups";

export const imperialUnits: Record<string, SiUnitDefinition[]> = {
  Length: [
    {
      dataTypeBaseUrl: systemDataTypes.inches.dataTypeBaseUrl,
      title: "Inch",
      titlePlural: "Inches",
      description:
        "A unit of length expressed in inches. Based on the international yard of exactly 0.9144 meters.",
      symbol: "in",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.meters.dataTypeBaseUrl]: scaledConversion({
          factor: 0.0254,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.feet.dataTypeBaseUrl,
      title: "Foot",
      titlePlural: "Feet",
      description:
        "A unit of length expressed in feet. Based on the international yard of exactly 0.9144 meters.",
      symbol: "ft",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.meters.dataTypeBaseUrl]: scaledConversion({
          factor: 0.3048,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.yards.dataTypeBaseUrl,
      title: "Yard",
      titlePlural: "Yards",
      description:
        "A unit of length expressed in yards. Based on the international yard of exactly 0.9144 meters.",
      symbol: "yd",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.meters.dataTypeBaseUrl]: scaledConversion({
          factor: 0.9144,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.miles.dataTypeBaseUrl,
      title: "Mile",
      titlePlural: "Miles",
      description:
        "A unit of length expressed in miles. Based on the international yard of exactly 0.9144 meters.",
      symbol: "mi",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.meters.dataTypeBaseUrl]: scaledConversion({
          factor: 1609.344,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.thousandthsOfAnInch.dataTypeBaseUrl,
      title: "Thousandth of an Inch",
      titlePlural: "Thousandths of an Inch",
      description:
        "A unit of length expressed in thousandths of an inch. Based on the international yard of exactly 0.9144 meters.",
      symbol: "thou",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.meters.dataTypeBaseUrl]: scaledConversion({
          factor: 2.54e-5,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.hands.dataTypeBaseUrl,
      title: "Hand",
      titlePlural: "Hands",
      description:
        "A unit of length expressed in hands. Based on the international yard of exactly 0.9144 meters.",
      symbol: "hh",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.meters.dataTypeBaseUrl]: scaledConversion({
          factor: 0.1016,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.links.dataTypeBaseUrl,
      title: "Link",
      titlePlural: "Links",
      description:
        "A unit of length expressed in links. Based on the international yard of exactly 0.9144 meters.",
      symbol: "li",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.meters.dataTypeBaseUrl]: scaledConversion({
          factor: 0.201168,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.rods.dataTypeBaseUrl,
      title: "Rod",
      titlePlural: "Rods",
      description:
        "A unit of length expressed in rods. Based on the international yard of exactly 0.9144 meters.",
      symbol: "rd",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.meters.dataTypeBaseUrl]: scaledConversion({
          factor: 5.0292,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.chains.dataTypeBaseUrl,
      title: "Chain",
      titlePlural: "Chains",
      description:
        "A unit of length expressed in chains. Based on the international yard of exactly 0.9144 meters.",
      symbol: "ch",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.meters.dataTypeBaseUrl]: scaledConversion({
          factor: 20.1168,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.furlongs.dataTypeBaseUrl,
      title: "Furlong",
      titlePlural: "Furlongs",
      description:
        "A unit of length expressed in furlongs. Based on the international yard of exactly 0.9144 meters.",
      symbol: "fur",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.meters.dataTypeBaseUrl]: scaledConversion({
          factor: 201.168,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.fathoms.dataTypeBaseUrl,
      title: "Fathom",
      titlePlural: "Fathoms",
      description:
        "A unit of length expressed in fathoms. Based on the international yard of exactly 0.9144 meters.",
      symbol: "ftm",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.meters.dataTypeBaseUrl]: scaledConversion({
          factor: 1.8288,
        }),
      },
    },
  ],
  Mass: [
    {
      dataTypeBaseUrl: systemDataTypes.pounds.dataTypeBaseUrl,
      title: "Pound",
      titlePlural: "Pounds",
      description: "A unit of mass expressed in pounds. Uses avoirdupois mass.",
      symbol: "lb",
      systems: ["Imperial", "US Customary"],
      conversions: {
        [systemDataTypes.kilograms.dataTypeBaseUrl]: scaledConversion({
          factor: 0.45359237,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.ounces.dataTypeBaseUrl,
      title: "Ounce",
      titlePlural: "Ounces",
      description: "A unit of mass expressed in ounces. Uses avoirdupois mass.",
      symbol: "oz",
      systems: ["Imperial", "US Customary"],
      conversions: {
        [systemDataTypes.kilograms.dataTypeBaseUrl]: scaledConversion({
          factor: 0.028349523125,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.stones.dataTypeBaseUrl,
      title: "Stone",
      titlePlural: "Stones",
      description: "A unit of mass expressed in stones.",
      symbol: "st",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.kilograms.dataTypeBaseUrl]: scaledConversion({
          factor: 6.35029318,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.grains.dataTypeBaseUrl,
      title: "Grain",
      titlePlural: "Grains",
      description: "A unit of mass expressed in grains.",
      symbol: "gr",
      systems: ["Imperial", "US Customary"],
      conversions: {
        [systemDataTypes.kilograms.dataTypeBaseUrl]: scaledConversion({
          factor: 6.479891e-5,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.longHundredweights.dataTypeBaseUrl,
      title: "Long Hundredweight",
      titlePlural: "Long Hundredweights",
      description: "A unit of mass expressed in long hundredweights.",
      symbol: "cwt (UK)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.kilograms.dataTypeBaseUrl]: scaledConversion({
          factor: 50.80234544,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.longTons.dataTypeBaseUrl,
      title: "Long Ton",
      titlePlural: "Long Tons",
      description: "A unit of mass expressed in long tons.",
      symbol: "long ton",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.kilograms.dataTypeBaseUrl]: scaledConversion({
          factor: 1016.0469088,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.troyOunces.dataTypeBaseUrl,
      title: "Troy Ounce",
      titlePlural: "Troy Ounces",
      description: "A unit of mass expressed in troy ounces.",
      symbol: "oz t",
      systems: ["Imperial", "US Customary"],
      conversions: {
        [systemDataTypes.kilograms.dataTypeBaseUrl]: scaledConversion({
          factor: 0.0311034768,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.troyPounds.dataTypeBaseUrl,
      title: "Troy Pound",
      titlePlural: "Troy Pounds",
      description: "A unit of mass expressed in troy pounds.",
      symbol: "lb t",
      systems: ["Imperial", "US Customary"],
      conversions: {
        [systemDataTypes.kilograms.dataTypeBaseUrl]: scaledConversion({
          factor: 0.3732417216,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.pennyweights.dataTypeBaseUrl,
      title: "Pennyweight",
      titlePlural: "Pennyweights",
      description: "A unit of mass expressed in pennyweights.",
      symbol: "dwt",
      systems: ["Imperial", "US Customary"],
      conversions: {
        [systemDataTypes.kilograms.dataTypeBaseUrl]: scaledConversion({
          factor: 0.00155517384,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.slugs.dataTypeBaseUrl,
      title: "Slug",
      titlePlural: "Slugs",
      description: "A unit of mass expressed in slugs.",
      symbol: "slug",
      systems: ["Imperial", "US Customary"],
      conversions: {
        [systemDataTypes.kilograms.dataTypeBaseUrl]: scaledConversion({
          factor: 4.4482216152605,
          divisor: 0.3048,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.shortHundredweights.dataTypeBaseUrl,
      title: "Short Hundredweight",
      titlePlural: "Short Hundredweights",
      description: "A unit of mass expressed in short hundredweights.",
      symbol: "cwt (US)",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.kilograms.dataTypeBaseUrl]: scaledConversion({
          factor: 45.359237,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.shortTons.dataTypeBaseUrl,
      title: "Short Ton",
      titlePlural: "Short Tons",
      description: "A unit of mass expressed in short tons.",
      symbol: "short ton",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.kilograms.dataTypeBaseUrl]: scaledConversion({
          factor: 907.18474,
        }),
      },
    },
  ],
  Area: [
    {
      dataTypeBaseUrl: systemDataTypes.squareInches.dataTypeBaseUrl,
      title: "Square Inch",
      titlePlural: "Square Inches",
      description:
        "A unit of area expressed in square inches. Based on the international foot of exactly 0.3048 meters.",
      symbol: "in²",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.squareMetres.dataTypeBaseUrl]: scaledConversion({
          factor: 0.00064516,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.squareFeet.dataTypeBaseUrl,
      title: "Square Foot",
      titlePlural: "Square Feet",
      description:
        "A unit of area expressed in square feet. Based on the international foot of exactly 0.3048 meters.",
      symbol: "ft²",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.squareMetres.dataTypeBaseUrl]: scaledConversion({
          factor: 0.09290304,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.squareYards.dataTypeBaseUrl,
      title: "Square Yard",
      titlePlural: "Square Yards",
      description:
        "A unit of area expressed in square yards. Based on the international foot of exactly 0.3048 meters.",
      symbol: "yd²",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.squareMetres.dataTypeBaseUrl]: scaledConversion({
          factor: 0.83612736,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.squareMiles.dataTypeBaseUrl,
      title: "Square Mile",
      titlePlural: "Square Miles",
      description:
        "A unit of area expressed in square miles. Based on the international foot of exactly 0.3048 meters.",
      symbol: "mi²",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.squareMetres.dataTypeBaseUrl]: scaledConversion({
          factor: 2589988.110336,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.acres.dataTypeBaseUrl,
      title: "Acre",
      titlePlural: "Acres",
      description:
        "A unit of area expressed in acres. Based on the international foot of exactly 0.3048 meters.",
      symbol: "ac",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.squareMetres.dataTypeBaseUrl]: scaledConversion({
          factor: 4046.8564224,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.roods.dataTypeBaseUrl,
      title: "Rood",
      titlePlural: "Roods",
      description:
        "A unit of area expressed in roods. Based on the international foot of exactly 0.3048 meters.",
      symbol: "rood",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.squareMetres.dataTypeBaseUrl]: scaledConversion({
          factor: 1011.7141056,
        }),
      },
    },
  ],
  Volume: [
    {
      dataTypeBaseUrl: systemDataTypes.cubicInches.dataTypeBaseUrl,
      title: "Cubic Inch",
      titlePlural: "Cubic Inches",
      description: "A unit of volume expressed in cubic inches.",
      symbol: "in³",
      systems: ["Imperial", "US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion({
          factor: 0.016387064,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.cubicFeet.dataTypeBaseUrl,
      title: "Cubic Foot",
      titlePlural: "Cubic Feet",
      description: "A unit of volume expressed in cubic feet.",
      symbol: "ft³",
      systems: ["Imperial", "US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion({
          factor: 28.316846592,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.cubicYards.dataTypeBaseUrl,
      title: "Cubic Yard",
      titlePlural: "Cubic Yards",
      description: "A unit of volume expressed in cubic yards.",
      symbol: "yd³",
      systems: ["Imperial", "US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion({
          factor: 764.554857984,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.imperialGallons.dataTypeBaseUrl,
      title: "Imperial Gallon",
      titlePlural: "Imperial Gallons",
      description: "A unit of volume expressed in imperial gallons.",
      symbol: "gal (UK)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion({
          factor: 4.54609,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.imperialQuarts.dataTypeBaseUrl,
      title: "Imperial Quart",
      titlePlural: "Imperial Quarts",
      description: "A unit of volume expressed in imperial quarts.",
      symbol: "qt (UK)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion({
          factor: 1.1365225,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.imperialPints.dataTypeBaseUrl,
      title: "Imperial Pint",
      titlePlural: "Imperial Pints",
      description: "A unit of volume expressed in imperial pints.",
      symbol: "pt (UK)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion({
          factor: 0.56826125,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.imperialGills.dataTypeBaseUrl,
      title: "Imperial Gill",
      titlePlural: "Imperial Gills",
      description: "A unit of volume expressed in imperial gills.",
      symbol: "gi (UK)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion({
          factor: 0.1420653125,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.imperialFluidOunces.dataTypeBaseUrl,
      title: "Imperial Fluid Ounce",
      titlePlural: "Imperial Fluid Ounces",
      description: "A unit of volume expressed in imperial fluid ounces.",
      symbol: "fl oz (UK)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion({
          factor: 0.0284130625,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.imperialBushels.dataTypeBaseUrl,
      title: "Imperial Bushel",
      titlePlural: "Imperial Bushels",
      description: "A unit of volume expressed in imperial bushels.",
      symbol: "bu (UK)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion({
          factor: 36.36872,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.imperialPecks.dataTypeBaseUrl,
      title: "Imperial Peck",
      titlePlural: "Imperial Pecks",
      description: "A unit of volume expressed in imperial pecks.",
      symbol: "pk (UK)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion({
          factor: 9.09218,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.usLiquidGallons.dataTypeBaseUrl,
      title: "US Liquid Gallon",
      titlePlural: "US Liquid Gallons",
      description: "A unit of volume expressed in us liquid gallons.",
      symbol: "gal (US)",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion({
          factor: 3.785411784,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.usLiquidQuarts.dataTypeBaseUrl,
      title: "US Liquid Quart",
      titlePlural: "US Liquid Quarts",
      description: "A unit of volume expressed in us liquid quarts.",
      symbol: "qt (US)",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion({
          factor: 0.946352946,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.usLiquidPints.dataTypeBaseUrl,
      title: "US Liquid Pint",
      titlePlural: "US Liquid Pints",
      description: "A unit of volume expressed in us liquid pints.",
      symbol: "pt (US)",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion({
          factor: 0.473176473,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.usCups.dataTypeBaseUrl,
      title: "US Cup",
      titlePlural: "US Cups",
      description:
        "A US customary cup, equal to 8 US fluid ounces or 236.5882365 millilitres.",
      symbol: "cup (US)",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion({
          factor: 0.2365882365,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.usFluidOunces.dataTypeBaseUrl,
      title: "US Fluid Ounce",
      titlePlural: "US Fluid Ounces",
      description: "A unit of volume expressed in us fluid ounces.",
      symbol: "fl oz (US)",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion({
          factor: 0.0295735295625,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.usTablespoons.dataTypeBaseUrl,
      title: "US Tablespoon",
      titlePlural: "US Tablespoons",
      description: "A unit of volume expressed in us tablespoons.",
      symbol: "tbsp (US)",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion({
          factor: 0.01478676478125,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.usTeaspoons.dataTypeBaseUrl,
      title: "US Teaspoon",
      titlePlural: "US Teaspoons",
      description: "A unit of volume expressed in us teaspoons.",
      symbol: "tsp (US)",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion({
          factor: 0.00492892159375,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.usDryGallons.dataTypeBaseUrl,
      title: "US Dry Gallon",
      titlePlural: "US Dry Gallons",
      description: "A unit of volume expressed in us dry gallons.",
      symbol: "dry gal (US)",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion({
          factor: 4.40488377086,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.usDryQuarts.dataTypeBaseUrl,
      title: "US Dry Quart",
      titlePlural: "US Dry Quarts",
      description: "A unit of volume expressed in us dry quarts.",
      symbol: "dry qt (US)",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion({
          factor: 1.101220942715,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.usDryPints.dataTypeBaseUrl,
      title: "US Dry Pint",
      titlePlural: "US Dry Pints",
      description: "A unit of volume expressed in us dry pints.",
      symbol: "dry pt (US)",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion({
          factor: 0.5506104713575,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.usBushels.dataTypeBaseUrl,
      title: "US Bushel",
      titlePlural: "US Bushels",
      description: "A unit of volume expressed in us bushels.",
      symbol: "bu (US)",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion({
          factor: 35.23907016688,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.usPecks.dataTypeBaseUrl,
      title: "US Peck",
      titlePlural: "US Pecks",
      description: "A unit of volume expressed in us pecks.",
      symbol: "pk (US)",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion({
          factor: 8.80976754172,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.petroleumBarrels.dataTypeBaseUrl,
      title: "Petroleum Barrel",
      titlePlural: "Petroleum Barrels",
      description: "A petroleum barrel, equal to 42 US liquid gallons.",
      symbol: "bbl",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion({
          factor: 158.987294928,
        }),
      },
    },
  ],
  Temperature: [
    {
      dataTypeBaseUrl: systemDataTypes.degreesRankine.dataTypeBaseUrl,
      title: "Degree Rankine",
      titlePlural: "Degrees Rankine",
      description:
        "A unit of absolute temperature with the same scale interval as degrees Fahrenheit.",
      symbol: "°R",
      systems: ["Imperial"],
      minimum: 0,
      conversions: {
        [systemDataTypes.kelvins.dataTypeBaseUrl]: scaledConversion({
          factor: 5.0,
          divisor: 9.0,
        }),
      },
    },
  ],
  Force: [
    {
      dataTypeBaseUrl: systemDataTypes.poundsForce.dataTypeBaseUrl,
      title: "Pound-Force",
      titlePlural: "Pounds-Force",
      description: "A unit of force expressed in pounds-force.",
      symbol: "lbf",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.newtons.dataTypeBaseUrl]: scaledConversion({
          factor: 4.4482216152605,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.ouncesForce.dataTypeBaseUrl,
      title: "Ounce-Force",
      titlePlural: "Ounces-Force",
      description: "A unit of force expressed in ounces-force.",
      symbol: "ozf",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.newtons.dataTypeBaseUrl]: scaledConversion({
          factor: 4.4482216152605,
          divisor: 16.0,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.kips.dataTypeBaseUrl,
      title: "Kip",
      titlePlural: "Kips",
      description: "A unit of force expressed in kips.",
      symbol: "kip",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.newtons.dataTypeBaseUrl]: scaledConversion({
          factor: 4448.2216152605,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.poundals.dataTypeBaseUrl,
      title: "Poundal",
      titlePlural: "Poundals",
      description: "A unit of force expressed in poundals.",
      symbol: "pdl",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.newtons.dataTypeBaseUrl]: scaledConversion({
          factor: 0.138254954376,
        }),
      },
    },
  ],
  Pressure: [
    {
      dataTypeBaseUrl: systemDataTypes.poundsForcePerSquareInch.dataTypeBaseUrl,
      title: "Pound-Force per Square Inch",
      titlePlural: "Pounds-Force per Square Inch",
      description:
        "A unit of pressure expressed in pounds-force per square inch.",
      symbol: "psi",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.pascals.dataTypeBaseUrl]: scaledConversion({
          factor: 4.4482216152605,
          divisor: 0.00064516,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.poundsForcePerSquareFoot.dataTypeBaseUrl,
      title: "Pound-Force per Square Foot",
      titlePlural: "Pounds-Force per Square Foot",
      description:
        "A unit of pressure expressed in pounds-force per square foot.",
      symbol: "psf",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.pascals.dataTypeBaseUrl]: scaledConversion({
          factor: 4.4482216152605,
          divisor: 0.09290304,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.kipsPerSquareInch.dataTypeBaseUrl,
      title: "Kip per Square Inch",
      titlePlural: "Kips per Square Inch",
      description: "A unit of pressure expressed in kips per square inch.",
      symbol: "ksi",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.pascals.dataTypeBaseUrl]: scaledConversion({
          factor: 4448.2216152605,
          divisor: 0.00064516,
        }),
      },
    },
  ],
  Energy: [
    {
      dataTypeBaseUrl: systemDataTypes.britishThermalUnitsIt.dataTypeBaseUrl,
      title: "British Thermal Unit (IT)",
      titlePlural: "British Thermal Units (IT)",
      description:
        "A unit of energy expressed in british thermal units (it). Uses the International Table British thermal unit, equal to 1055.05585262 joules.",
      symbol: "Btu (IT)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.joules.dataTypeBaseUrl]: scaledConversion({
          factor: 1055.05585262,
        }),
      },
    },
    {
      dataTypeBaseUrl:
        systemDataTypes.britishThermalUnitsThermochemical.dataTypeBaseUrl,
      title: "British Thermal Unit (Thermochemical)",
      titlePlural: "British Thermal Units (Thermochemical)",
      description:
        "A unit of energy expressed in british thermal units (thermochemical). Uses the thermochemical calorie of exactly 4.184 joules.",
      symbol: "Btu (th)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.joules.dataTypeBaseUrl]: scaledConversion({
          factor: 9489.1523804,
          divisor: 9.0,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.footPoundsForce.dataTypeBaseUrl,
      title: "Foot Pound-Force",
      titlePlural: "Foot Pounds-Force",
      description: "A unit of energy expressed in foot pounds-force.",
      symbol: "ft·lbf",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.joules.dataTypeBaseUrl]: scaledConversion({
          factor: 1.3558179483314003,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.inchPoundsForce.dataTypeBaseUrl,
      title: "Inch Pound-Force",
      titlePlural: "Inch Pounds-Force",
      description: "A unit of energy expressed in inch pounds-force.",
      symbol: "in·lbf",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.joules.dataTypeBaseUrl]: scaledConversion({
          factor: 0.1129848290276167,
        }),
      },
    },
  ],
  Power: [
    {
      dataTypeBaseUrl: systemDataTypes.mechanicalHorsepower.dataTypeBaseUrl,
      title: "Mechanical Horsepower",
      titlePlural: "Mechanical Horsepower",
      description: "A unit of power expressed in mechanical horsepower.",
      symbol: "hp",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.watts.dataTypeBaseUrl]: scaledConversion({
          factor: 745.6998715822702,
        }),
      },
    },
    {
      dataTypeBaseUrl:
        systemDataTypes.britishThermalUnitsItPerHour.dataTypeBaseUrl,
      title: "British Thermal Unit (IT) per Hour",
      titlePlural: "British Thermal Units (IT) per Hour",
      description:
        "A unit of power expressed in british thermal units (it) per hour. Uses the International Table British thermal unit, equal to 1055.05585262 joules.",
      symbol: "Btu (IT)/h",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.watts.dataTypeBaseUrl]: scaledConversion({
          factor: 1055.05585262,
          divisor: 3600.0,
        }),
      },
    },
    {
      dataTypeBaseUrl:
        systemDataTypes.britishThermalUnitsItPerSecond.dataTypeBaseUrl,
      title: "British Thermal Unit (IT) per Second",
      titlePlural: "British Thermal Units (IT) per Second",
      description:
        "A unit of power expressed in british thermal units (it) per second. Uses the International Table British thermal unit, equal to 1055.05585262 joules.",
      symbol: "Btu (IT)/s",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.watts.dataTypeBaseUrl]: scaledConversion({
          factor: 1055.05585262,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.footPoundsForcePerSecond.dataTypeBaseUrl,
      title: "Foot Pound-Force per Second",
      titlePlural: "Foot Pounds-Force per Second",
      description: "A unit of power expressed in foot pounds-force per second.",
      symbol: "ft·lbf/s",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.watts.dataTypeBaseUrl]: scaledConversion({
          factor: 1.3558179483314003,
        }),
      },
    },
  ],
  Speed: [
    {
      dataTypeBaseUrl: systemDataTypes.feetPerSecond.dataTypeBaseUrl,
      title: "Foot per Second",
      titlePlural: "Feet per Second",
      description: "A unit of speed expressed in feet per second.",
      symbol: "ft/s",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.metersPerSecond.dataTypeBaseUrl]: scaledConversion({
          factor: 0.3048,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.feetPerMinute.dataTypeBaseUrl,
      title: "Foot per Minute",
      titlePlural: "Feet per Minute",
      description: "A unit of speed expressed in feet per minute.",
      symbol: "ft/min",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.metersPerSecond.dataTypeBaseUrl]: scaledConversion({
          factor: 0.00508,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.inchesPerSecond.dataTypeBaseUrl,
      title: "Inch per Second",
      titlePlural: "Inches per Second",
      description: "A unit of speed expressed in inches per second.",
      symbol: "in/s",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.metersPerSecond.dataTypeBaseUrl]: scaledConversion({
          factor: 0.0254,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.milesPerHour.dataTypeBaseUrl,
      title: "Mile per Hour",
      titlePlural: "Miles per Hour",
      description: "A unit of speed expressed in miles per hour.",
      symbol: "mph",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.metersPerSecond.dataTypeBaseUrl]: scaledConversion({
          factor: 0.44704,
        }),
      },
    },
  ],
  Acceleration: [
    {
      dataTypeBaseUrl: systemDataTypes.feetPerSecondSquared.dataTypeBaseUrl,
      title: "Foot per Second Squared",
      titlePlural: "Feet per Second Squared",
      description:
        "A unit of acceleration expressed in feet per second squared.",
      symbol: "ft/s²",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.metersPerSecondSquared.dataTypeBaseUrl]:
          scaledConversion({ factor: 0.3048 }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.inchesPerSecondSquared.dataTypeBaseUrl,
      title: "Inch per Second Squared",
      titlePlural: "Inches per Second Squared",
      description:
        "A unit of acceleration expressed in inches per second squared.",
      symbol: "in/s²",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.metersPerSecondSquared.dataTypeBaseUrl]:
          scaledConversion({ factor: 0.0254 }),
      },
    },
  ],
  Wavenumber: [
    {
      dataTypeBaseUrl: systemDataTypes.reciprocalFeet.dataTypeBaseUrl,
      title: "Reciprocal Foot",
      titlePlural: "Reciprocal Feet",
      description: "A unit of wavenumber expressed in reciprocal feet.",
      symbol: "ft⁻¹",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.reciprocalMeters.dataTypeBaseUrl]: scaledConversion({
          factor: 1.0,
          divisor: 0.3048,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.reciprocalInches.dataTypeBaseUrl,
      title: "Reciprocal Inch",
      titlePlural: "Reciprocal Inches",
      description: "A unit of wavenumber expressed in reciprocal inches.",
      symbol: "in⁻¹",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.reciprocalMeters.dataTypeBaseUrl]: scaledConversion({
          factor: 1.0,
          divisor: 0.0254,
        }),
      },
    },
  ],
  "Mass Density": [
    {
      dataTypeBaseUrl: systemDataTypes.poundsPerCubicFoot.dataTypeBaseUrl,
      title: "Pound per Cubic Foot",
      titlePlural: "Pounds per Cubic Foot",
      description: "A unit of mass density expressed in pounds per cubic foot.",
      symbol: "lb/ft³",
      systems: ["Imperial", "US Customary"],
      conversions: {
        [systemDataTypes.kilogramsPerCubicMeter.dataTypeBaseUrl]:
          scaledConversion({ factor: 0.45359237, divisor: 0.028316846592 }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.poundsPerCubicInch.dataTypeBaseUrl,
      title: "Pound per Cubic Inch",
      titlePlural: "Pounds per Cubic Inch",
      description: "A unit of mass density expressed in pounds per cubic inch.",
      symbol: "lb/in³",
      systems: ["Imperial", "US Customary"],
      conversions: {
        [systemDataTypes.kilogramsPerCubicMeter.dataTypeBaseUrl]:
          scaledConversion({ factor: 0.45359237, divisor: 1.6387064e-5 }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.poundsPerCubicYard.dataTypeBaseUrl,
      title: "Pound per Cubic Yard",
      titlePlural: "Pounds per Cubic Yard",
      description: "A unit of mass density expressed in pounds per cubic yard.",
      symbol: "lb/yd³",
      systems: ["Imperial", "US Customary"],
      conversions: {
        [systemDataTypes.kilogramsPerCubicMeter.dataTypeBaseUrl]:
          scaledConversion({ factor: 0.45359237, divisor: 0.764554857984 }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.poundsPerImperialGallon.dataTypeBaseUrl,
      title: "Pound per Imperial Gallon",
      titlePlural: "Pounds per Imperial Gallon",
      description:
        "A unit of mass density expressed in pounds per imperial gallon.",
      symbol: "lb/gal (UK)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.kilogramsPerCubicMeter.dataTypeBaseUrl]:
          scaledConversion({ factor: 0.45359237, divisor: 0.00454609 }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.poundsPerUsLiquidGallon.dataTypeBaseUrl,
      title: "Pound per US Liquid Gallon",
      titlePlural: "Pounds per US Liquid Gallon",
      description:
        "A unit of mass density expressed in pounds per us liquid gallon.",
      symbol: "lb/gal (US)",
      systems: ["US Customary"],
      conversions: {
        [systemDataTypes.kilogramsPerCubicMeter.dataTypeBaseUrl]:
          scaledConversion({ factor: 0.45359237, divisor: 0.003785411784 }),
      },
    },
  ],
  "Surface Density": [
    {
      dataTypeBaseUrl: systemDataTypes.poundsPerSquareFoot.dataTypeBaseUrl,
      title: "Pound per Square Foot",
      titlePlural: "Pounds per Square Foot",
      description:
        "A unit of surface density expressed in pounds per square foot.",
      symbol: "lb/ft²",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.kilogramsPerSquareMeter.dataTypeBaseUrl]:
          scaledConversion({ factor: 0.45359237, divisor: 0.09290304 }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.ouncesPerSquareYard.dataTypeBaseUrl,
      title: "Ounce per Square Yard",
      titlePlural: "Ounces per Square Yard",
      description:
        "A unit of surface density expressed in ounces per square yard.",
      symbol: "oz/yd²",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.kilogramsPerSquareMeter.dataTypeBaseUrl]:
          scaledConversion({ factor: 0.028349523125, divisor: 0.83612736 }),
      },
    },
  ],
  "Specific Volume": [
    {
      dataTypeBaseUrl: systemDataTypes.cubicFeetPerPound.dataTypeBaseUrl,
      title: "Cubic Foot per Pound",
      titlePlural: "Cubic Feet per Pound",
      description:
        "A unit of specific volume expressed in cubic feet per pound.",
      symbol: "ft³/lb",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.cubicMetersPerKilogram.dataTypeBaseUrl]:
          scaledConversion({ factor: 0.028316846592, divisor: 0.45359237 }),
      },
    },
  ],
  "Amount of Substance": [
    {
      dataTypeBaseUrl: systemDataTypes.poundMoles.dataTypeBaseUrl,
      title: "Pound Mole",
      titlePlural: "Pound Moles",
      description: "A unit of amount of substance expressed in pound moles.",
      symbol: "lbmol",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.moles.dataTypeBaseUrl]: scaledConversion({
          factor: 453.59237,
        }),
      },
    },
  ],
  "Amount Concentration": [
    {
      dataTypeBaseUrl: systemDataTypes.poundMolesPerCubicFoot.dataTypeBaseUrl,
      title: "Pound Mole per Cubic Foot",
      titlePlural: "Pound Moles per Cubic Foot",
      description:
        "A unit of amount concentration expressed in pound moles per cubic foot.",
      symbol: "lbmol/ft³",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.molesPerCubicMeter.dataTypeBaseUrl]: scaledConversion({
          factor: 453.59237,
          divisor: 0.028316846592,
        }),
      },
    },
  ],
  Illuminance: [
    {
      dataTypeBaseUrl: systemDataTypes.footCandles.dataTypeBaseUrl,
      title: "Foot-Candle",
      titlePlural: "Foot-Candles",
      description: "Illuminance of one lumen per square international foot.",
      symbol: "fc",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.lux.dataTypeBaseUrl]: scaledConversion({
          factor: 1.0,
          divisor: 0.09290304,
        }),
      },
    },
  ],
  Luminance: [
    {
      dataTypeBaseUrl: systemDataTypes.candelasPerSquareFoot.dataTypeBaseUrl,
      title: "Candela per Square Foot",
      titlePlural: "Candelas per Square Foot",
      description: "A unit of luminance expressed in candelas per square foot.",
      symbol: "cd/ft²",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.candelasPerSquareMeter.dataTypeBaseUrl]:
          scaledConversion({ factor: 1.0, divisor: 0.09290304 }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.candelasPerSquareInch.dataTypeBaseUrl,
      title: "Candela per Square Inch",
      titlePlural: "Candelas per Square Inch",
      description: "A unit of luminance expressed in candelas per square inch.",
      symbol: "cd/in²",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.candelasPerSquareMeter.dataTypeBaseUrl]:
          scaledConversion({ factor: 1.0, divisor: 0.00064516 }),
      },
    },
  ],
  "Dynamic Viscosity": [
    {
      dataTypeBaseUrl:
        systemDataTypes.poundsForceSecondsPerSquareFoot.dataTypeBaseUrl,
      title: "Pound-Force Second per Square Foot",
      titlePlural: "Pound-Force Seconds per Square Foot",
      description:
        "A unit of dynamic viscosity expressed in pounds-force seconds per square foot.",
      symbol: "lbf·s/ft²",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.pascalSeconds.dataTypeBaseUrl]: scaledConversion({
          factor: 4.4482216152605,
          divisor: 0.09290304,
        }),
      },
    },
    {
      dataTypeBaseUrl:
        systemDataTypes.poundsForceSecondsPerSquareInch.dataTypeBaseUrl,
      title: "Pound-Force Second per Square Inch",
      titlePlural: "Pound-Force Seconds per Square Inch",
      description:
        "A unit of dynamic viscosity expressed in pounds-force seconds per square inch.",
      symbol: "lbf·s/in²",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.pascalSeconds.dataTypeBaseUrl]: scaledConversion({
          factor: 4.4482216152605,
          divisor: 0.00064516,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.poundsPerFootSecond.dataTypeBaseUrl,
      title: "Pound per Foot Second",
      titlePlural: "Pounds per Foot Second",
      description:
        "A unit of dynamic viscosity expressed in pounds per foot second.",
      symbol: "lb/(ft·s)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.pascalSeconds.dataTypeBaseUrl]: scaledConversion({
          factor: 0.45359237,
          divisor: 0.3048,
        }),
      },
    },
  ],
  Torque: [
    {
      dataTypeBaseUrl: systemDataTypes.poundForceFeet.dataTypeBaseUrl,
      title: "Pound-Force Foot",
      titlePlural: "Pound-Force Feet",
      description: "A unit of torque expressed in pound-force feet.",
      symbol: "lbf·ft",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.newtonMeters.dataTypeBaseUrl]: scaledConversion({
          factor: 1.3558179483314003,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.poundForceInches.dataTypeBaseUrl,
      title: "Pound-Force Inch",
      titlePlural: "Pound-Force Inches",
      description: "A unit of torque expressed in pound-force inches.",
      symbol: "lbf·in",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.newtonMeters.dataTypeBaseUrl]: scaledConversion({
          factor: 0.1129848290276167,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.ounceForceInches.dataTypeBaseUrl,
      title: "Ounce-Force Inch",
      titlePlural: "Ounce-Force Inches",
      description: "A unit of torque expressed in ounce-force inches.",
      symbol: "ozf·in",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.newtonMeters.dataTypeBaseUrl]: scaledConversion({
          factor: 0.0070615518142260435,
        }),
      },
    },
  ],
  "Surface Tension": [
    {
      dataTypeBaseUrl: systemDataTypes.poundsForcePerFoot.dataTypeBaseUrl,
      title: "Pound-Force per Foot",
      titlePlural: "Pounds-Force per Foot",
      description:
        "A unit of surface tension expressed in pounds-force per foot.",
      symbol: "lbf/ft",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.newtonsPerMeter.dataTypeBaseUrl]: scaledConversion({
          factor: 4.4482216152605,
          divisor: 0.3048,
        }),
      },
    },
    {
      dataTypeBaseUrl: systemDataTypes.poundsForcePerInch.dataTypeBaseUrl,
      title: "Pound-Force per Inch",
      titlePlural: "Pounds-Force per Inch",
      description:
        "A unit of surface tension expressed in pounds-force per inch.",
      symbol: "lbf/in",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.newtonsPerMeter.dataTypeBaseUrl]: scaledConversion({
          factor: 4.4482216152605,
          divisor: 0.0254,
        }),
      },
    },
  ],
  "Heat Flux Density": [
    {
      dataTypeBaseUrl:
        systemDataTypes.britishThermalUnitsItPerSquareFootHour.dataTypeBaseUrl,
      title: "British Thermal Unit (IT) per Square Foot Hour",
      titlePlural: "British Thermal Units (IT) per Square Foot Hour",
      description:
        "A unit of heat flux density expressed in british thermal units (it) per square foot hour. Uses the International Table British thermal unit, equal to 1055.05585262 joules.",
      symbol: "Btu (IT)/(ft²·h)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.wattsPerSquareMeter.dataTypeBaseUrl]: scaledConversion(
          { factor: 1055.05585262, divisor: 334.450944 },
        ),
      },
    },
  ],
  "Heat Capacity": [
    {
      dataTypeBaseUrl:
        systemDataTypes.britishThermalUnitsItPerDegreeRankine.dataTypeBaseUrl,
      title: "British Thermal Unit (IT) per Degree Rankine",
      titlePlural: "British Thermal Units (IT) per Degree Rankine",
      description:
        "A unit of heat capacity expressed in british thermal units (it) per degree rankine. Uses the International Table British thermal unit, equal to 1055.05585262 joules. Each degree Rankine in the denominator represents a temperature interval of 5/9 kelvin.",
      symbol: "Btu (IT)/°R",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.joulesPerKelvin.dataTypeBaseUrl]: scaledConversion({
          factor: 1899.100534716,
        }),
      },
    },
  ],
  "Specific Heat Capacity": [
    {
      dataTypeBaseUrl:
        systemDataTypes.britishThermalUnitsItPerPoundDegreeRankine
          .dataTypeBaseUrl,
      title: "British Thermal Unit (IT) per Pound Degree Rankine",
      titlePlural: "British Thermal Units (IT) per Pound Degree Rankine",
      description:
        "A unit of specific heat capacity expressed in british thermal units (it) per pound degree rankine. Uses the International Table British thermal unit, equal to 1055.05585262 joules. Each degree Rankine in the denominator represents a temperature interval of 5/9 kelvin.",
      symbol: "Btu (IT)/(lb·°R)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.joulesPerKilogramKelvin.dataTypeBaseUrl]:
          scaledConversion({ factor: 4186.8 }),
      },
    },
  ],
  "Specific Energy": [
    {
      dataTypeBaseUrl:
        systemDataTypes.britishThermalUnitsItPerPound.dataTypeBaseUrl,
      title: "British Thermal Unit (IT) per Pound",
      titlePlural: "British Thermal Units (IT) per Pound",
      description:
        "A unit of specific energy expressed in british thermal units (it) per pound. Uses the International Table British thermal unit, equal to 1055.05585262 joules.",
      symbol: "Btu (IT)/lb",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.joulesPerKilogram.dataTypeBaseUrl]: scaledConversion({
          factor: 1055.05585262,
          divisor: 0.45359237,
        }),
      },
    },
  ],
  "Thermal Conductivity": [
    {
      dataTypeBaseUrl:
        systemDataTypes.britishThermalUnitsItPerHourFootDegreeRankine
          .dataTypeBaseUrl,
      title: "British Thermal Unit (IT) per Hour Foot Degree Rankine",
      titlePlural: "British Thermal Units (IT) per Hour Foot Degree Rankine",
      description:
        "A unit of thermal conductivity expressed in british thermal units (it) per hour foot degree rankine. Uses the International Table British thermal unit, equal to 1055.05585262 joules. Each degree Rankine in the denominator represents a temperature interval of 5/9 kelvin.",
      symbol: "Btu (IT)/(h·ft·°R)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.wattsPerMeterKelvin.dataTypeBaseUrl]: scaledConversion(
          { factor: 1055.05585262, divisor: 609.6 },
        ),
      },
    },
  ],
  "Energy Density": [
    {
      dataTypeBaseUrl:
        systemDataTypes.britishThermalUnitsItPerCubicFoot.dataTypeBaseUrl,
      title: "British Thermal Unit (IT) per Cubic Foot",
      titlePlural: "British Thermal Units (IT) per Cubic Foot",
      description:
        "A unit of energy density expressed in british thermal units (it) per cubic foot. Uses the International Table British thermal unit, equal to 1055.05585262 joules.",
      symbol: "Btu (IT)/ft³",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.joulesPerCubicMeter.dataTypeBaseUrl]: scaledConversion(
          { factor: 1055.05585262, divisor: 0.028316846592 },
        ),
      },
    },
  ],
  "Molar Energy": [
    {
      dataTypeBaseUrl:
        systemDataTypes.britishThermalUnitsItPerPoundMole.dataTypeBaseUrl,
      title: "British Thermal Unit (IT) per Pound Mole",
      titlePlural: "British Thermal Units (IT) per Pound Mole",
      description:
        "A unit of molar energy expressed in british thermal units (it) per pound mole. Uses the International Table British thermal unit, equal to 1055.05585262 joules.",
      symbol: "Btu (IT)/lbmol",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.joulesPerMole.dataTypeBaseUrl]: scaledConversion({
          factor: 1055.05585262,
          divisor: 453.59237,
        }),
      },
    },
  ],
  "Molar Heat Capacity": [
    {
      dataTypeBaseUrl:
        systemDataTypes.britishThermalUnitsItPerPoundMoleDegreeRankine
          .dataTypeBaseUrl,
      title: "British Thermal Unit (IT) per Pound Mole Degree Rankine",
      titlePlural: "British Thermal Units (IT) per Pound Mole Degree Rankine",
      description:
        "A unit of molar heat capacity expressed in british thermal units (it) per pound mole degree rankine. Uses the International Table British thermal unit, equal to 1055.05585262 joules. Each degree Rankine in the denominator represents a temperature interval of 5/9 kelvin.",
      symbol: "Btu (IT)/(lbmol·°R)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.joulesPerMoleKelvin.dataTypeBaseUrl]: scaledConversion(
          { factor: 4.1868 },
        ),
      },
    },
  ],
  "Electric Current Density": [
    {
      dataTypeBaseUrl: systemDataTypes.amperesPerSquareFoot.dataTypeBaseUrl,
      title: "Ampere per Square Foot",
      titlePlural: "Amperes per Square Foot",
      description:
        "A unit of electric current density expressed in amperes per square foot.",
      symbol: "A/ft²",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.amperesPerSquareMeter.dataTypeBaseUrl]:
          scaledConversion({ factor: 1.0, divisor: 0.09290304 }),
      },
    },
  ],
  "Magnetic Field Strength": [
    {
      dataTypeBaseUrl: systemDataTypes.amperesPerFoot.dataTypeBaseUrl,
      title: "Ampere per Foot",
      titlePlural: "Amperes per Foot",
      description:
        "A unit of magnetic field strength expressed in amperes per foot.",
      symbol: "A/ft",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.amperesPerMeter.dataTypeBaseUrl]: scaledConversion({
          factor: 1.0,
          divisor: 0.3048,
        }),
      },
    },
  ],
  "Electric Field Strength": [
    {
      dataTypeBaseUrl: systemDataTypes.voltsPerFoot.dataTypeBaseUrl,
      title: "Volt per Foot",
      titlePlural: "Volts per Foot",
      description:
        "A unit of electric field strength expressed in volts per foot.",
      symbol: "V/ft",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.voltsPerMeter.dataTypeBaseUrl]: scaledConversion({
          factor: 1.0,
          divisor: 0.3048,
        }),
      },
    },
  ],
  "Electric Charge Density": [
    {
      dataTypeBaseUrl: systemDataTypes.coulombsPerCubicFoot.dataTypeBaseUrl,
      title: "Coulomb per Cubic Foot",
      titlePlural: "Coulombs per Cubic Foot",
      description:
        "A unit of electric charge density expressed in coulombs per cubic foot.",
      symbol: "C/ft³",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.coulombsPerCubicMeter.dataTypeBaseUrl]:
          scaledConversion({ factor: 1.0, divisor: 0.028316846592 }),
      },
    },
  ],
  "Surface Charge Density": [
    {
      dataTypeBaseUrl: systemDataTypes.coulombsPerSquareFoot.dataTypeBaseUrl,
      title: "Coulomb per Square Foot",
      titlePlural: "Coulombs per Square Foot",
      description:
        "A unit of surface charge density expressed in coulombs per square foot.",
      symbol: "C/ft²",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.coulombsPerSquareMeter.dataTypeBaseUrl]:
          scaledConversion({ factor: 1.0, divisor: 0.09290304 }),
      },
    },
  ],
  Permittivity: [
    {
      dataTypeBaseUrl: systemDataTypes.faradsPerFoot.dataTypeBaseUrl,
      title: "Farad per Foot",
      titlePlural: "Farads per Foot",
      description: "A unit of permittivity expressed in farads per foot.",
      symbol: "F/ft",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.faradsPerMeter.dataTypeBaseUrl]: scaledConversion({
          factor: 1.0,
          divisor: 0.3048,
        }),
      },
    },
  ],
  "Magnetic Permeability": [
    {
      dataTypeBaseUrl: systemDataTypes.henriesPerFoot.dataTypeBaseUrl,
      title: "Henry per Foot",
      titlePlural: "Henries per Foot",
      description:
        "A unit of magnetic permeability expressed in henries per foot.",
      symbol: "H/ft",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.henriesPerMeter.dataTypeBaseUrl]: scaledConversion({
          factor: 1.0,
          divisor: 0.3048,
        }),
      },
    },
  ],
  "Radiation Exposure": [
    {
      dataTypeBaseUrl: systemDataTypes.coulombsPerPound.dataTypeBaseUrl,
      title: "Coulomb per Pound",
      titlePlural: "Coulombs per Pound",
      description:
        "A unit of radiation exposure expressed in coulombs per pound.",
      symbol: "C/lb",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.coulombsPerKilogram.dataTypeBaseUrl]: scaledConversion(
          { factor: 1.0, divisor: 0.45359237 },
        ),
      },
    },
  ],
  Radiance: [
    {
      dataTypeBaseUrl:
        systemDataTypes.wattsPerSquareFootSteradian.dataTypeBaseUrl,
      title: "Watt per Square Foot Steradian",
      titlePlural: "Watts per Square Foot Steradian",
      description:
        "A unit of radiance expressed in watts per square foot steradian.",
      symbol: "W/(ft²·sr)",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.wattsPerSquareMeterSteradian.dataTypeBaseUrl]:
          scaledConversion({ factor: 1.0, divisor: 0.09290304 }),
      },
    },
  ],
  "Catalytic Activity Concentration": [
    {
      dataTypeBaseUrl: systemDataTypes.katalsPerCubicFoot.dataTypeBaseUrl,
      title: "Katal per Cubic Foot",
      titlePlural: "Katals per Cubic Foot",
      description:
        "A unit of catalytic activity concentration expressed in katals per cubic foot.",
      symbol: "kat/ft³",
      systems: ["Imperial"],
      conversions: {
        [systemDataTypes.katalsPerCubicMeter.dataTypeBaseUrl]: scaledConversion(
          { factor: 1.0, divisor: 0.028316846592 },
        ),
      },
    },
  ],
};

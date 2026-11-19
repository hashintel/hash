import { systemDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { affineConversion, scaledConversion } from "./shared/conversions";
import { expandSiPrefixes } from "./si-unit-groups/expand-si-prefixes";
import { fluidPermeabilityUnits } from "./si-unit-groups/fluid-permeability-units";
import { imperialUnits } from "./si-unit-groups/imperial-units";

import type { BaseUrl, Conversions } from "@blockprotocol/type-system";

export type UnitSystem = "Metric" | "Imperial" | "US Customary";

export type SiUnitDefinition = {
  systems?: UnitSystem[];
  dataTypeBaseUrl?: BaseUrl;
  title: string;
  titlePlural?: string;
  singularTitle?: string;
  description: string;
  symbol: string;
  minimum?: number;
  conversions?: Record<BaseUrl, Conversions>;
};

export type SiUnitGroup = {
  title: string;
  titlePlural?: string;
  description: string;
  units: SiUnitDefinition[];
  sharedUnits?: string[];
};

const unprefixedGroups: SiUnitGroup[] = [
  {
    title: "Length",
    titlePlural: "Lengths",
    description: "A measure of distance.",
    units: [
      {
        dataTypeBaseUrl: systemDataTypes.meters.dataTypeBaseUrl,
        title: "Meters",
        titlePlural: "Meters",
        singularTitle: "Meter",
        description:
          "The base unit of length in the International System of Units (SI).",
        symbol: "m",
      },
      {
        dataTypeBaseUrl: systemDataTypes.millimeters.dataTypeBaseUrl,
        title: "Millimeters",
        titlePlural: "Millimeters",
        description:
          "A unit of length in the International System of Units (SI), equal to one thousandth of a meter.",
        symbol: "mm",
        conversions: {
          [systemDataTypes.meters.dataTypeBaseUrl]: scaledConversion({
            factor: 0.001,
          }),
        },
      },
      {
        dataTypeBaseUrl: systemDataTypes.centimeters.dataTypeBaseUrl,
        title: "Centimeters",
        titlePlural: "Centimeters",
        description:
          "A unit of length in the International System of Units (SI), equal to one hundredth of a meter.",
        symbol: "cm",
        conversions: {
          [systemDataTypes.meters.dataTypeBaseUrl]: scaledConversion({
            factor: 0.01,
          }),
        },
      },
      {
        dataTypeBaseUrl: systemDataTypes.kilometers.dataTypeBaseUrl,
        title: "Kilometers",
        titlePlural: "Kilometers",
        description:
          "A unit of length in the International System of Units (SI), equal to one thousand meters.",
        symbol: "km",
        conversions: {
          [systemDataTypes.meters.dataTypeBaseUrl]: scaledConversion({
            factor: 1000,
          }),
        },
      },
    ],
  },
  {
    title: "Mass",
    titlePlural: "Masses",
    description: "A measure of the amount of matter in an object.",
    units: [
      {
        dataTypeBaseUrl: systemDataTypes.kilograms.dataTypeBaseUrl,
        title: "Kilograms",
        titlePlural: "Kilograms",
        description: "The SI base unit of mass, equal to 1000 grams.",
        symbol: "kg",
      },
      {
        dataTypeBaseUrl: systemDataTypes.grams.dataTypeBaseUrl,
        title: "Grams",
        titlePlural: "Grams",
        singularTitle: "Gram",
        description:
          "A metric unit of mass equal to one thousandth of a kilogram.",
        symbol: "g",
        conversions: {
          [systemDataTypes.kilograms.dataTypeBaseUrl]: scaledConversion({
            factor: 0.001,
          }),
        },
      },
      {
        dataTypeBaseUrl: systemDataTypes.metricTonnes.dataTypeBaseUrl,
        title: "Metric Tonnes",
        titlePlural: "Metric Tonnes",
        description: "A metric unit of mass equal to 1000 kilograms.",
        symbol: "t",
        conversions: {
          [systemDataTypes.kilograms.dataTypeBaseUrl]: scaledConversion({
            factor: 1000,
          }),
        },
      },
    ],
  },
  {
    title: "Duration",
    titlePlural: "Durations",
    description: "A measure of the length of time.",
    units: [
      {
        dataTypeBaseUrl: systemDataTypes.second.dataTypeBaseUrl,
        title: "Second",
        titlePlural: "Seconds",
        description:
          "The base unit of duration in the International System of Units (SI), defined as about 9 billion oscillations of the caesium atom.",
        symbol: "s",
      },
      {
        dataTypeBaseUrl: systemDataTypes.millisecond.dataTypeBaseUrl,
        title: "Millisecond",
        titlePlural: "Milliseconds",
        description:
          "A measure of the length of time in the International System of Units (SI), defined as exactly 1/1000 of a second.",
        symbol: "ms",
        conversions: {
          [systemDataTypes.second.dataTypeBaseUrl]: scaledConversion({
            factor: 0.001,
          }),
        },
      },
      {
        dataTypeBaseUrl: systemDataTypes.microsecond.dataTypeBaseUrl,
        title: "Microsecond",
        titlePlural: "Microseconds",
        description:
          "A measure of the length of time in the International System of Units (SI), defined as exactly 1/1000000 (1 millionth) of a second.",
        symbol: "µs",
        conversions: {
          [systemDataTypes.second.dataTypeBaseUrl]: scaledConversion({
            factor: 0.000001,
          }),
        },
      },
      {
        dataTypeBaseUrl: systemDataTypes.minute.dataTypeBaseUrl,
        title: "Minute",
        titlePlural: "Minutes",
        symbol: "min",
        description:
          "A measure of the length of time, defined as exactly 60 seconds.",
        conversions: {
          [systemDataTypes.second.dataTypeBaseUrl]: scaledConversion({
            factor: 60,
          }),
        },
      },
      {
        dataTypeBaseUrl: systemDataTypes.hour.dataTypeBaseUrl,
        title: "Hour",
        titlePlural: "Hours",
        symbol: "h",
        description:
          "A measure of the length of time, defined as exactly 3,600 seconds.",
        conversions: {
          [systemDataTypes.second.dataTypeBaseUrl]: scaledConversion({
            factor: 3600,
          }),
        },
      },
      {
        dataTypeBaseUrl: systemDataTypes.day.dataTypeBaseUrl,
        title: "Day",
        titlePlural: "Days",
        symbol: "d",
        description: "A duration of exactly 24 hours.",
        conversions: {
          [systemDataTypes.second.dataTypeBaseUrl]: scaledConversion({
            factor: 86400,
          }),
        },
      },
      {
        dataTypeBaseUrl: systemDataTypes.week.dataTypeBaseUrl,
        title: "Week",
        titlePlural: "Weeks",
        symbol: "wk",
        description: "A duration of exactly 7 days.",
        conversions: {
          [systemDataTypes.second.dataTypeBaseUrl]: scaledConversion({
            factor: 604800,
          }),
        },
      },
      {
        dataTypeBaseUrl: systemDataTypes.month.dataTypeBaseUrl,
        title: "Month",
        titlePlural: "Months",
        symbol: "mo",
        description:
          "A mean duration of 2,629,800 seconds. Calendar months vary in length.",
        conversions: {
          [systemDataTypes.second.dataTypeBaseUrl]: scaledConversion({
            factor: 2629800,
          }),
        },
      },
      {
        dataTypeBaseUrl: systemDataTypes.year.dataTypeBaseUrl,
        title: "Year",
        titlePlural: "Years",
        symbol: "yr",
        description:
          "A duration of 31,557,600 seconds (365.25 days). Calendar years vary in length.",
        conversions: {
          [systemDataTypes.second.dataTypeBaseUrl]: scaledConversion({
            factor: 31557600,
          }),
        },
      },
      {
        dataTypeBaseUrl: systemDataTypes.hours.dataTypeBaseUrl,
        title: "Hours",
        titlePlural: "Hours",
        symbol: "h",
        description: "A unit of time equal to 60 minutes.",
        conversions: {
          [systemDataTypes.second.dataTypeBaseUrl]: scaledConversion({
            factor: 3600,
          }),
        },
      },
      {
        dataTypeBaseUrl: systemDataTypes.days.dataTypeBaseUrl,
        title: "Days",
        titlePlural: "Days",
        symbol: "d",
        description: "A unit of time equal to 24 hours.",
        conversions: {
          [systemDataTypes.second.dataTypeBaseUrl]: scaledConversion({
            factor: 86400,
          }),
        },
      },
    ],
  },
  {
    title: "Frequency",
    titlePlural: "Frequencies",
    description:
      "The number of occurrences of a repeating event per unit of time (temporal frequency).",
    units: [
      {
        dataTypeBaseUrl: systemDataTypes.hertz.dataTypeBaseUrl,
        title: "Hertz",
        titlePlural: "Hertz",
        description:
          "A unit of frequency in the International System of Units (SI), equivalent to one cycle per second.",
        symbol: "Hz",
      },
      {
        dataTypeBaseUrl: systemDataTypes.kilohertz.dataTypeBaseUrl,
        title: "Kilohertz",
        titlePlural: "Kilohertz",
        description:
          "A unit of frequency in the International System of Units (SI), equal to one thousand hertz.",
        symbol: "kHz",
        conversions: {
          [systemDataTypes.hertz.dataTypeBaseUrl]: scaledConversion({
            factor: 1000,
          }),
        },
      },
      {
        dataTypeBaseUrl: systemDataTypes.megahertz.dataTypeBaseUrl,
        title: "Megahertz",
        titlePlural: "Megahertz",
        description:
          "A unit of frequency in the International System of Units (SI), equal to one million hertz.",
        symbol: "MHz",
        conversions: {
          [systemDataTypes.hertz.dataTypeBaseUrl]: scaledConversion({
            factor: 1000000,
          }),
        },
      },
      {
        dataTypeBaseUrl: systemDataTypes.gigahertz.dataTypeBaseUrl,
        title: "Gigahertz",
        titlePlural: "Gigahertz",
        description:
          "A unit of frequency in the International System of Units (SI), equal to one billion hertz.",
        symbol: "GHz",
        conversions: {
          [systemDataTypes.hertz.dataTypeBaseUrl]: scaledConversion({
            factor: 1000000000,
          }),
        },
      },
    ],
  },
  {
    title: "Power",
    titlePlural: "Powers",
    description: "The amount of energy transferred or converted per unit time.",
    units: [
      {
        dataTypeBaseUrl: systemDataTypes.watts.dataTypeBaseUrl,
        title: "Watts",
        titlePlural: "Watts",
        singularTitle: "Watt",
        description:
          "The unit of power or radiant flux in the International System of Units (SI) – the rate at which work is done or energy is transferred. Equal to one joule per second.",
        symbol: "W",
      },
      {
        dataTypeBaseUrl: systemDataTypes.kilowatts.dataTypeBaseUrl,
        title: "Kilowatts",
        titlePlural: "Kilowatts",
        description:
          "A unit of power in the International System of Units (SI), equal to one thousand watts.",
        symbol: "kW",
        conversions: {
          [systemDataTypes.watts.dataTypeBaseUrl]: scaledConversion({
            factor: 1000,
          }),
        },
      },
      {
        dataTypeBaseUrl: systemDataTypes.megawatts.dataTypeBaseUrl,
        title: "Megawatts",
        titlePlural: "Megawatts",
        description:
          "A unit of power in the International System of Units (SI), equal to one million watts.",
        symbol: "MW",
        conversions: {
          [systemDataTypes.watts.dataTypeBaseUrl]: scaledConversion({
            factor: 1000000,
          }),
        },
      },
      {
        dataTypeBaseUrl: systemDataTypes.gigawatts.dataTypeBaseUrl,
        title: "Gigawatts",
        titlePlural: "Gigawatts",
        description:
          "A unit of power in the International System of Units (SI), equal to one billion watts.",
        symbol: "GW",
        conversions: {
          [systemDataTypes.watts.dataTypeBaseUrl]: scaledConversion({
            factor: 1000000000,
          }),
        },
      },
    ],
  },
  {
    title: "Area",
    titlePlural: "Areas",
    description: "A measure of the extent of a two-dimensional surface.",
    units: [
      {
        dataTypeBaseUrl: systemDataTypes.squareMetres.dataTypeBaseUrl,
        title: "Square Metres",
        titlePlural: "Square Metres",
        description:
          "A metric unit of area equal to a square one metre on each side.",
        symbol: "m²",
      },
      {
        dataTypeBaseUrl: systemDataTypes.squareCentimetres.dataTypeBaseUrl,
        title: "Square Centimetres",
        titlePlural: "Square Centimetres",
        description:
          "A metric unit of area equal to one ten-thousandth of a square metre.",
        symbol: "cm²",
        conversions: {
          [systemDataTypes.squareMetres.dataTypeBaseUrl]: scaledConversion({
            factor: 0.0001,
          }),
        },
      },
    ],
  },
  {
    title: "Volume",
    titlePlural: "Volumes",
    description:
      "A measure of the three-dimensional space occupied by something.",
    units: [
      {
        dataTypeBaseUrl: systemDataTypes.litres.dataTypeBaseUrl,
        title: "Litres",
        titlePlural: "Litres",
        singularTitle: "Litre",
        description: "A metric unit of volume equal to one cubic decimetre.",
        symbol: "L",
      },
      {
        dataTypeBaseUrl: systemDataTypes.millilitres.dataTypeBaseUrl,
        title: "Millilitres",
        titlePlural: "Millilitres",
        description:
          "A metric unit of volume equal to one thousandth of a litre.",
        symbol: "mL",
        conversions: {
          [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion({
            factor: 0.001,
          }),
        },
      },
      {
        dataTypeBaseUrl: systemDataTypes.cubicMetres.dataTypeBaseUrl,
        title: "Cubic Metres",
        titlePlural: "Cubic Metres",
        description: "A metric unit of volume equal to 1000 litres.",
        symbol: "m³",
        conversions: {
          [systemDataTypes.litres.dataTypeBaseUrl]: scaledConversion({
            factor: 1000,
          }),
        },
      },
    ],
  },
  {
    title: "Electric Current",
    titlePlural: "Electric Currents",
    description: "The rate of flow of electric charge.",
    units: [
      {
        title: "Ampere",
        titlePlural: "Amperes",
        symbol: "A",
        description: "The SI base unit of electric current.",
      },
      {
        title: "Milliampere",
        titlePlural: "Milliamperes",
        symbol: "mA",
        description: "A unit of electric current equal to 0.001 amperes.",
        conversions: {
          [systemDataTypes.ampere.dataTypeBaseUrl]: scaledConversion({
            factor: 0.001,
          }),
        },
      },
      {
        title: "Microampere",
        titlePlural: "Microamperes",
        symbol: "µA",
        description: "A unit of electric current equal to 0.000001 amperes.",
        conversions: {
          [systemDataTypes.ampere.dataTypeBaseUrl]: scaledConversion({
            factor: 1e-6,
          }),
        },
      },
    ],
  },
  {
    title: "Temperature",
    titlePlural: "Temperatures",
    description:
      "A measure of temperature on an absolute or offset temperature scale.",
    units: [
      {
        title: "Kelvin",
        titlePlural: "Kelvins",
        symbol: "K",
        description:
          "The SI base unit of thermodynamic temperature, measured from absolute zero.",
        minimum: 0,
      },
      {
        title: "Degree Celsius",
        titlePlural: "Degrees Celsius",
        symbol: "°C",
        description:
          "A unit of Celsius temperature. Add 273.15 to obtain the temperature in kelvins.",
        conversions: {
          [systemDataTypes.kelvin.dataTypeBaseUrl]: affineConversion({
            offset: 273.15,
          }),
        },
        minimum: -273.15,
      },
      {
        title: "Degree Fahrenheit",
        titlePlural: "Degrees Fahrenheit",
        systems: ["Imperial"],
        symbol: "°F",
        description:
          "A unit of Fahrenheit temperature. Absolute zero is −459.67 °F.",
        conversions: {
          [systemDataTypes.kelvin.dataTypeBaseUrl]: affineConversion({
            factor: 5,
            divisor: 9,
            inputOffset: 459.67,
          }),
        },
        minimum: -459.67,
      },
    ],
  },
  {
    title: "Amount of Substance",
    titlePlural: "Amounts of Substance",
    description:
      "A measure of the number of specified elementary entities in a sample.",
    units: [
      {
        title: "Mole",
        titlePlural: "Moles",
        symbol: "mol",
        description:
          "The SI base unit of amount of substance. One mole contains exactly 6.02214076 × 10²³ specified elementary entities.",
      },
      {
        title: "Millimole",
        titlePlural: "Millimoles",
        symbol: "mmol",
        description: "A unit of amount of substance equal to 0.001 moles.",
        conversions: {
          [systemDataTypes.mole.dataTypeBaseUrl]: scaledConversion({
            factor: 0.001,
          }),
        },
      },
      {
        title: "Micromole",
        titlePlural: "Micromoles",
        symbol: "µmol",
        description: "A unit of amount of substance equal to 0.000001 moles.",
        conversions: {
          [systemDataTypes.mole.dataTypeBaseUrl]: scaledConversion({
            factor: 1e-6,
          }),
        },
      },
    ],
  },
  {
    title: "Luminous Intensity",
    titlePlural: "Luminous Intensities",
    description:
      "The luminous flux emitted per unit solid angle in a given direction.",
    units: [
      {
        title: "Candela",
        titlePlural: "Candelas",
        symbol: "cd",
        description: "The SI base unit of luminous intensity.",
      },
    ],
  },
  {
    title: "Angle",
    titlePlural: "Angles",
    description:
      "A measure of rotation or the space between two intersecting lines.",
    units: [
      {
        dataTypeBaseUrl: systemDataTypes.degree.dataTypeBaseUrl,
        title: "Degree",
        titlePlural: "Degrees",
        symbol: "°",
        description:
          "A unit of angular measure equal to 1/360 of a full rotation.",
      },
      {
        title: "Radian",
        titlePlural: "Radians",
        symbol: "rad",
        description: "The SI unit of plane angle. A full turn is 2π radians.",
        conversions: {
          [systemDataTypes.degree.dataTypeBaseUrl]: scaledConversion({
            factor: 180,
            divisor: 3.141592653589793,
          }),
        },
      },
    ],
  },
  {
    title: "Solid Angle",
    titlePlural: "Solid Angles",
    description:
      "A measure of the angular extent of a surface as seen from a point.",
    units: [
      {
        title: "Steradian",
        titlePlural: "Steradians",
        symbol: "sr",
        description:
          "The SI unit of solid angle. A complete sphere subtends 4π steradians.",
      },
    ],
  },
  {
    title: "Force",
    titlePlural: "Forces",
    description: "A measure of an interaction that changes momentum.",
    units: [
      {
        title: "Newton",
        titlePlural: "Newtons",
        symbol: "N",
        description:
          "The SI unit of force, equal to one kilogram meter per second squared.",
      },
      {
        title: "Kilonewton",
        titlePlural: "Kilonewtons",
        symbol: "kN",
        description: "A unit of force equal to 1000 newtons.",
        conversions: {
          [systemDataTypes.newton.dataTypeBaseUrl]: scaledConversion({
            factor: 1000,
          }),
        },
      },
    ],
  },
  {
    title: "Pressure",
    titlePlural: "Pressures",
    description: "Force applied per unit area, also used to express stress.",
    units: [
      {
        title: "Pascal",
        titlePlural: "Pascals",
        symbol: "Pa",
        description:
          "The SI unit of pressure and stress, equal to one newton per square meter.",
      },
      {
        title: "Hectopascal",
        titlePlural: "Hectopascals",
        symbol: "hPa",
        description: "A unit of pressure equal to 100 pascals.",
        conversions: {
          [systemDataTypes.pascal.dataTypeBaseUrl]: scaledConversion({
            factor: 100,
          }),
        },
      },
      {
        title: "Kilopascal",
        titlePlural: "Kilopascals",
        symbol: "kPa",
        description: "A unit of pressure equal to 1000 pascals.",
        conversions: {
          [systemDataTypes.pascal.dataTypeBaseUrl]: scaledConversion({
            factor: 1000,
          }),
        },
      },
      {
        title: "Megapascal",
        titlePlural: "Megapascals",
        symbol: "MPa",
        description: "A unit of pressure equal to 1000000 pascals.",
        conversions: {
          [systemDataTypes.pascal.dataTypeBaseUrl]: scaledConversion({
            factor: 1000000,
          }),
        },
      },
      {
        title: "Bar",
        titlePlural: "Bars",
        symbol: "bar",
        description: "A unit of pressure equal to 100000 pascals.",
        conversions: {
          [systemDataTypes.pascal.dataTypeBaseUrl]: scaledConversion({
            factor: 100000,
          }),
        },
      },
      {
        title: "Standard Atmosphere",
        titlePlural: "Standard Atmospheres",
        symbol: "atm",
        description: "A unit of pressure equal to 101325 pascals.",
        conversions: {
          [systemDataTypes.pascal.dataTypeBaseUrl]: scaledConversion({
            factor: 101325,
          }),
        },
      },
    ],
  },
  {
    title: "Energy",
    titlePlural: "Energies",
    description: "A measure of energy, work, or heat.",
    units: [
      {
        title: "Joule",
        titlePlural: "Joules",
        symbol: "J",
        description:
          "The SI unit of energy, work, and heat, equal to one newton meter.",
      },
      {
        title: "Kilojoule",
        titlePlural: "Kilojoules",
        symbol: "kJ",
        description: "A unit of energy equal to 1000 joules.",
        conversions: {
          [systemDataTypes.joule.dataTypeBaseUrl]: scaledConversion({
            factor: 1000,
          }),
        },
      },
      {
        title: "Megajoule",
        titlePlural: "Megajoules",
        symbol: "MJ",
        description: "A unit of energy equal to 1000000 joules.",
        conversions: {
          [systemDataTypes.joule.dataTypeBaseUrl]: scaledConversion({
            factor: 1000000,
          }),
        },
      },
      {
        title: "Watt Hour",
        titlePlural: "Watt Hours",
        symbol: "W·h",
        description: "A unit of energy equal to 3600 joules.",
        conversions: {
          [systemDataTypes.joule.dataTypeBaseUrl]: scaledConversion({
            factor: 3600,
          }),
        },
      },
      {
        title: "Kilowatt Hour",
        titlePlural: "Kilowatt Hours",
        symbol: "kW·h",
        description: "A unit of energy equal to 3600000 joules.",
        conversions: {
          [systemDataTypes.joule.dataTypeBaseUrl]: scaledConversion({
            factor: 3600000,
          }),
        },
      },
    ],
  },
  {
    title: "Electric Charge",
    titlePlural: "Electric Charges",
    description: "A measure of electric charge.",
    units: [
      {
        title: "Coulomb",
        titlePlural: "Coulombs",
        symbol: "C",
        description:
          "The SI unit of electric charge, equal to one ampere second.",
      },
      {
        title: "Ampere Hour",
        titlePlural: "Ampere Hours",
        symbol: "A·h",
        description: "A unit of electric charge equal to 3600 coulombs.",
        conversions: {
          [systemDataTypes.coulomb.dataTypeBaseUrl]: scaledConversion({
            factor: 3600,
          }),
        },
      },
      {
        title: "Milliampere Hour",
        titlePlural: "Milliampere Hours",
        symbol: "mA·h",
        description: "A unit of electric charge equal to 3.6 coulombs.",
        conversions: {
          [systemDataTypes.coulomb.dataTypeBaseUrl]: scaledConversion({
            factor: 3.6,
          }),
        },
      },
    ],
  },
  {
    title: "Electric Potential Difference",
    titlePlural: "Electric Potential Differences",
    description:
      "The energy transferred per unit electric charge between two points.",
    units: [
      {
        title: "Volt",
        titlePlural: "Volts",
        symbol: "V",
        description:
          "The SI unit of electric potential difference and electromotive force, equal to one watt per ampere.",
      },
      {
        title: "Millivolt",
        titlePlural: "Millivolts",
        symbol: "mV",
        description:
          "A unit of electric potential difference equal to 0.001 volts.",
        conversions: {
          [systemDataTypes.volt.dataTypeBaseUrl]: scaledConversion({
            factor: 0.001,
          }),
        },
      },
      {
        title: "Kilovolt",
        titlePlural: "Kilovolts",
        symbol: "kV",
        description:
          "A unit of electric potential difference equal to 1000 volts.",
        conversions: {
          [systemDataTypes.volt.dataTypeBaseUrl]: scaledConversion({
            factor: 1000,
          }),
        },
      },
    ],
  },
  {
    title: "Capacitance",
    titlePlural: "Capacitances",
    description:
      "The electric charge stored per unit electric potential difference.",
    units: [
      {
        title: "Farad",
        titlePlural: "Farads",
        symbol: "F",
        description:
          "The SI unit of capacitance, equal to one coulomb per volt.",
      },
      {
        title: "Microfarad",
        titlePlural: "Microfarads",
        symbol: "µF",
        description: "A unit of capacitance equal to 1e-06 farads.",
        conversions: {
          [systemDataTypes.farad.dataTypeBaseUrl]: scaledConversion({
            factor: 1e-6,
          }),
        },
      },
      {
        title: "Nanofarad",
        titlePlural: "Nanofarads",
        symbol: "nF",
        description: "A unit of capacitance equal to 1e-09 farads.",
        conversions: {
          [systemDataTypes.farad.dataTypeBaseUrl]: scaledConversion({
            factor: 1e-9,
          }),
        },
      },
      {
        title: "Picofarad",
        titlePlural: "Picofarads",
        symbol: "pF",
        description: "A unit of capacitance equal to 1e-12 farads.",
        conversions: {
          [systemDataTypes.farad.dataTypeBaseUrl]: scaledConversion({
            factor: 1e-12,
          }),
        },
      },
    ],
  },
  {
    title: "Electric Resistance",
    titlePlural: "Electric Resistances",
    description:
      "The ratio of electric potential difference to electric current.",
    units: [
      {
        title: "Ohm",
        titlePlural: "Ohms",
        symbol: "Ω",
        description:
          "The SI unit of electric resistance, equal to one volt per ampere.",
      },
      {
        title: "Kilohm",
        titlePlural: "Kilohms",
        symbol: "kΩ",
        description: "A unit of electric resistance equal to 1000 ohms.",
        conversions: {
          [systemDataTypes.ohm.dataTypeBaseUrl]: scaledConversion({
            factor: 1000,
          }),
        },
      },
      {
        title: "Megohm",
        titlePlural: "Megohms",
        symbol: "MΩ",
        description: "A unit of electric resistance equal to 1000000 ohms.",
        conversions: {
          [systemDataTypes.ohm.dataTypeBaseUrl]: scaledConversion({
            factor: 1000000,
          }),
        },
      },
    ],
  },
  {
    title: "Electric Conductance",
    titlePlural: "Electric Conductances",
    description:
      "The ratio of electric current to electric potential difference.",
    units: [
      {
        title: "Siemens",
        titlePlural: "Siemens",
        symbol: "S",
        description:
          "The SI unit of electric conductance, equal to one ampere per volt.",
      },
    ],
  },
  {
    title: "Magnetic Flux",
    titlePlural: "Magnetic Fluxes",
    description: "The magnetic flux density integrated over a surface.",
    units: [
      {
        title: "Weber",
        titlePlural: "Webers",
        symbol: "Wb",
        description: "The SI unit of magnetic flux, equal to one volt second.",
      },
    ],
  },
  {
    title: "Magnetic Flux Density",
    titlePlural: "Magnetic Flux Densities",
    description: "A measure of magnetic flux per unit area.",
    units: [
      {
        title: "Tesla",
        titlePlural: "Teslas",
        symbol: "T",
        description:
          "The SI unit of magnetic flux density, equal to one weber per square meter.",
      },
      {
        title: "Millitesla",
        titlePlural: "Milliteslas",
        symbol: "mT",
        description: "A unit of magnetic flux density equal to 0.001 teslas.",
        conversions: {
          [systemDataTypes.tesla.dataTypeBaseUrl]: scaledConversion({
            factor: 0.001,
          }),
        },
      },
      {
        title: "Microtesla",
        titlePlural: "Microteslas",
        symbol: "µT",
        description:
          "A unit of magnetic flux density equal to 0.000001 teslas.",
        conversions: {
          [systemDataTypes.tesla.dataTypeBaseUrl]: scaledConversion({
            factor: 1e-6,
          }),
        },
      },
    ],
  },
  {
    title: "Inductance",
    titlePlural: "Inductances",
    description: "The magnetic flux linkage per unit electric current.",
    units: [
      {
        title: "Henry",
        titlePlural: "Henries",
        symbol: "H",
        description:
          "The SI unit of inductance, equal to one weber per ampere.",
      },
      {
        title: "Millihenry",
        titlePlural: "Millihenries",
        symbol: "mH",
        description: "A unit of inductance equal to 0.001 henries.",
        conversions: {
          [systemDataTypes.henry.dataTypeBaseUrl]: scaledConversion({
            factor: 0.001,
          }),
        },
      },
    ],
  },
  {
    title: "Luminous Flux",
    titlePlural: "Luminous Fluxes",
    description:
      "A measure of light output weighted by human visual sensitivity.",
    units: [
      {
        title: "Lumen",
        titlePlural: "Lumens",
        symbol: "lm",
        description:
          "The SI unit of luminous flux, equal to one candela steradian.",
      },
    ],
  },
  {
    title: "Illuminance",
    titlePlural: "Illuminances",
    description: "The luminous flux incident per unit area.",
    units: [
      {
        title: "Lux",
        titlePlural: "Lux",
        symbol: "lx",
        description:
          "The SI unit of illuminance, equal to one lumen per square meter.",
      },
    ],
  },
  {
    title: "Radionuclide Activity",
    titlePlural: "Radionuclide Activities",
    description:
      "The rate of spontaneous nuclear transformations in a radioactive sample.",
    units: [
      {
        title: "Becquerel",
        titlePlural: "Becquerels",
        symbol: "Bq",
        description:
          "The SI unit of radionuclide activity, equal to one nuclear transformation per second.",
      },
      {
        title: "Kilobecquerel",
        titlePlural: "Kilobecquerels",
        symbol: "kBq",
        description:
          "A unit of radionuclide activity equal to 1000 becquerels.",
        conversions: {
          [systemDataTypes.becquerel.dataTypeBaseUrl]: scaledConversion({
            factor: 1000,
          }),
        },
      },
    ],
  },
  {
    title: "Absorbed Dose",
    titlePlural: "Absorbed Doses",
    description: "The energy imparted by ionizing radiation per unit mass.",
    units: [
      {
        title: "Gray",
        titlePlural: "Grays",
        symbol: "Gy",
        description:
          "The SI unit of absorbed dose and kerma, equal to one joule per kilogram.",
      },
      {
        title: "Milligray",
        titlePlural: "Milligrays",
        symbol: "mGy",
        description: "A unit of absorbed dose equal to 0.001 grays.",
        conversions: {
          [systemDataTypes.gray.dataTypeBaseUrl]: scaledConversion({
            factor: 0.001,
          }),
        },
      },
    ],
  },
  {
    title: "Dose Equivalent",
    titlePlural: "Dose Equivalents",
    description:
      "The absorbed radiation dose weighted for its biological effect.",
    units: [
      {
        title: "Sievert",
        titlePlural: "Sieverts",
        symbol: "Sv",
        description:
          "The SI unit of dose equivalent, expressed as one joule per kilogram after radiation weighting.",
      },
      {
        title: "Millisievert",
        titlePlural: "Millisieverts",
        symbol: "mSv",
        description: "A unit of dose equivalent equal to 0.001 sieverts.",
        conversions: {
          [systemDataTypes.sievert.dataTypeBaseUrl]: scaledConversion({
            factor: 0.001,
          }),
        },
      },
      {
        title: "Microsievert",
        titlePlural: "Microsieverts",
        symbol: "µSv",
        description: "A unit of dose equivalent equal to 0.000001 sieverts.",
        conversions: {
          [systemDataTypes.sievert.dataTypeBaseUrl]: scaledConversion({
            factor: 1e-6,
          }),
        },
      },
    ],
  },
  {
    title: "Catalytic Activity",
    titlePlural: "Catalytic Activities",
    description:
      "The rate of conversion of a specified substance in a catalyzed reaction.",
    units: [
      {
        title: "Katal",
        titlePlural: "Katals",
        symbol: "kat",
        description:
          "The SI unit of catalytic activity, equal to one mole per second.",
      },
    ],
  },
  {
    title: "Speed",
    titlePlural: "Speeds",
    description:
      "A measure of the rate of movement or change in position over time.",
    units: [
      {
        dataTypeBaseUrl: systemDataTypes.metersPerSecond.dataTypeBaseUrl,
        title: "Meters per Second",
        titlePlural: "Meters per Second",
        symbol: "m/s",
        description:
          "The SI unit of speed, expressing the number of meters traveled in one second.",
      },
      {
        dataTypeBaseUrl: systemDataTypes.kilometersPerHour.dataTypeBaseUrl,
        title: "Kilometers per Hour",
        titlePlural: "Kilometers per Hour",
        symbol: "km/h",
        description:
          "A unit of speed expressing the number of kilometers traveled in one hour.",
        conversions: {
          [systemDataTypes.metersPerSecond.dataTypeBaseUrl]: scaledConversion({
            factor: 5,
            divisor: 18,
          }),
        },
      },
    ],
  },
  {
    title: "Acceleration",
    titlePlural: "Accelerations",
    description: "The rate of change of velocity.",
    units: [
      {
        title: "Meter per Second Squared",
        titlePlural: "Meters per Second Squared",
        symbol: "m/s²",
        description: "The coherent SI unit used to express acceleration.",
      },
    ],
  },
  {
    title: "Wavenumber",
    titlePlural: "Wavenumbers",
    description: "The number of spatial cycles per unit length.",
    units: [
      {
        title: "Reciprocal Meter",
        titlePlural: "Reciprocal Meters",
        symbol: "m⁻¹",
        description: "The coherent SI unit used to express wavenumber.",
      },
    ],
  },
  {
    title: "Mass Density",
    titlePlural: "Mass Densities",
    description:
      "Mass per unit volume, also used to express mass concentration.",
    units: [
      {
        title: "Kilogram per Cubic Meter",
        titlePlural: "Kilograms per Cubic Meter",
        symbol: "kg/m³",
        description: "The coherent SI unit used to express mass density.",
      },
      {
        dataTypeBaseUrl: systemDataTypes.gramPerCubicCentimeter.dataTypeBaseUrl,
        title: "Gram per Cubic Centimeter",
        titlePlural: "Grams per Cubic Centimeter",
        symbol: "g/cm³",
        description:
          "A unit of mass density equal to 1000 kilograms per cubic meter.",
        conversions: {
          [systemDataTypes.kilogramPerCubicMeter.dataTypeBaseUrl]:
            scaledConversion({ factor: 1000 }),
        },
      },
    ],
  },
  {
    title: "Surface Density",
    titlePlural: "Surface Densities",
    description: "Mass per unit area.",
    units: [
      {
        dataTypeBaseUrl: systemDataTypes.kilogramPerSquareMeter.dataTypeBaseUrl,
        title: "Kilogram per Square Meter",
        titlePlural: "Kilograms per Square Meter",
        symbol: "kg/m²",
        description: "The coherent SI unit used to express surface density.",
      },
    ],
  },
  {
    title: "Specific Volume",
    titlePlural: "Specific Volumes",
    description: "Volume per unit mass.",
    units: [
      {
        title: "Cubic Meter per Kilogram",
        titlePlural: "Cubic Meters per Kilogram",
        symbol: "m³/kg",
        description: "The coherent SI unit used to express specific volume.",
      },
    ],
  },
  {
    title: "Electric Current Density",
    titlePlural: "Electric Current Densities",
    description: "Electric current per unit area.",
    units: [
      {
        title: "Ampere per Square Meter",
        titlePlural: "Amperes per Square Meter",
        symbol: "A/m²",
        description:
          "The coherent SI unit used to express electric current density.",
      },
    ],
  },
  {
    title: "Magnetic Field Strength",
    titlePlural: "Magnetic Field Strengths",
    description:
      "A measure of the magnetic field associated with electric currents and magnetization.",
    units: [
      {
        title: "Ampere per Meter",
        titlePlural: "Amperes per Meter",
        symbol: "A/m",
        description:
          "The coherent SI unit used to express magnetic field strength.",
      },
    ],
  },
  {
    title: "Amount Concentration",
    titlePlural: "Amount Concentrations",
    description: "Amount of substance per unit volume.",
    units: [
      {
        title: "Mole per Cubic Meter",
        titlePlural: "Moles per Cubic Meter",
        symbol: "mol/m³",
        description:
          "The coherent SI unit used to express amount concentration.",
      },
      {
        title: "Mole per Liter",
        titlePlural: "Moles per Liter",
        symbol: "mol/L",
        description:
          "A unit of amount concentration equal to 1000 moles per cubic meter.",
        conversions: {
          [systemDataTypes.molePerCubicMeter.dataTypeBaseUrl]: scaledConversion(
            { factor: 1000 },
          ),
        },
      },
    ],
  },
  {
    title: "Luminance",
    titlePlural: "Luminances",
    description:
      "Luminous intensity per unit projected area in a given direction.",
    units: [
      {
        title: "Candela per Square Meter",
        titlePlural: "Candelas per Square Meter",
        symbol: "cd/m²",
        description: "The coherent SI unit used to express luminance.",
      },
    ],
  },
  {
    title: "Dynamic Viscosity",
    titlePlural: "Dynamic Viscosities",
    description:
      "The ratio of shear stress to the velocity gradient in a fluid.",
    units: [
      {
        title: "Pascal Second",
        titlePlural: "Pascal Seconds",
        symbol: "Pa·s",
        description: "The coherent SI unit used to express dynamic viscosity.",
      },
      {
        title: "Millipascal Second",
        titlePlural: "Millipascal Seconds",
        symbol: "mPa·s",
        description:
          "A unit of dynamic viscosity equal to 0.001 pascal seconds.",
        conversions: {
          [systemDataTypes.pascalSecond.dataTypeBaseUrl]: scaledConversion({
            factor: 0.001,
          }),
        },
      },
    ],
  },
  {
    title: "Torque",
    titlePlural: "Torques",
    description: "The moment of a force about an axis.",
    units: [
      {
        title: "Newton Meter",
        titlePlural: "Newton Meters",
        symbol: "N·m",
        description: "The coherent SI unit used to express torque.",
      },
    ],
  },
  {
    title: "Surface Tension",
    titlePlural: "Surface Tensions",
    description: "Force per unit length along a liquid interface.",
    units: [
      {
        title: "Newton per Meter",
        titlePlural: "Newtons per Meter",
        symbol: "N/m",
        description: "The coherent SI unit used to express surface tension.",
      },
    ],
  },
  {
    title: "Angular Velocity",
    titlePlural: "Angular Velocities",
    description:
      "The rate of change of angle, also used to express angular frequency.",
    units: [
      {
        title: "Radian per Second",
        titlePlural: "Radians per Second",
        symbol: "rad/s",
        description: "The coherent SI unit used to express angular velocity.",
      },
    ],
  },
  {
    title: "Angular Acceleration",
    titlePlural: "Angular Accelerations",
    description: "The rate of change of angular velocity.",
    units: [
      {
        dataTypeBaseUrl: systemDataTypes.radianPerSecondSquared.dataTypeBaseUrl,
        title: "Radian per Second Squared",
        titlePlural: "Radians per Second Squared",
        symbol: "rad/s²",
        description:
          "The coherent SI unit used to express angular acceleration.",
      },
    ],
  },
  {
    title: "Heat Flux Density",
    titlePlural: "Heat Flux Densities",
    description:
      "Power transferred per unit area, also used to express irradiance.",
    units: [
      {
        title: "Watt per Square Meter",
        titlePlural: "Watts per Square Meter",
        symbol: "W/m²",
        description: "The coherent SI unit used to express heat flux density.",
      },
    ],
  },
  {
    title: "Heat Capacity",
    titlePlural: "Heat Capacities",
    description:
      "The heat transferred per unit temperature change; the same unit also expresses entropy.",
    units: [
      {
        title: "Joule per Kelvin",
        titlePlural: "Joules per Kelvin",
        symbol: "J/K",
        description: "The coherent SI unit used to express heat capacity.",
      },
    ],
  },
  {
    title: "Specific Heat Capacity",
    titlePlural: "Specific Heat Capacities",
    description:
      "Heat capacity per unit mass; the same unit also expresses specific entropy.",
    units: [
      {
        dataTypeBaseUrl: systemDataTypes.joulePerKilogramKelvin.dataTypeBaseUrl,
        title: "Joule per Kilogram Kelvin",
        titlePlural: "Joules per Kilogram Kelvin",
        symbol: "J/(kg·K)",
        description:
          "The coherent SI unit used to express specific heat capacity.",
      },
    ],
  },
  {
    title: "Specific Energy",
    titlePlural: "Specific Energies",
    description: "Energy per unit mass.",
    units: [
      {
        title: "Joule per Kilogram",
        titlePlural: "Joules per Kilogram",
        symbol: "J/kg",
        description: "The coherent SI unit used to express specific energy.",
      },
    ],
  },
  {
    title: "Thermal Conductivity",
    titlePlural: "Thermal Conductivities",
    description: "The heat flux density per unit temperature gradient.",
    units: [
      {
        title: "Watt per Meter Kelvin",
        titlePlural: "Watts per Meter Kelvin",
        symbol: "W/(m·K)",
        description:
          "The coherent SI unit used to express thermal conductivity.",
      },
    ],
  },
  {
    title: "Energy Density",
    titlePlural: "Energy Densities",
    description: "Energy per unit volume.",
    units: [
      {
        title: "Joule per Cubic Meter",
        titlePlural: "Joules per Cubic Meter",
        symbol: "J/m³",
        description: "The coherent SI unit used to express energy density.",
      },
    ],
  },
  {
    title: "Electric Field Strength",
    titlePlural: "Electric Field Strengths",
    description: "Force per unit electric charge.",
    units: [
      {
        title: "Volt per Meter",
        titlePlural: "Volts per Meter",
        symbol: "V/m",
        description:
          "The coherent SI unit used to express electric field strength.",
      },
    ],
  },
  {
    title: "Electric Charge Density",
    titlePlural: "Electric Charge Densities",
    description: "Electric charge per unit volume.",
    units: [
      {
        title: "Coulomb per Cubic Meter",
        titlePlural: "Coulombs per Cubic Meter",
        symbol: "C/m³",
        description:
          "The coherent SI unit used to express electric charge density.",
      },
    ],
  },
  {
    title: "Surface Charge Density",
    titlePlural: "Surface Charge Densities",
    description:
      "Electric charge per unit area; the same unit also expresses electric flux density.",
    units: [
      {
        title: "Coulomb per Square Meter",
        titlePlural: "Coulombs per Square Meter",
        symbol: "C/m²",
        description:
          "The coherent SI unit used to express surface charge density.",
      },
    ],
  },
  {
    title: "Permittivity",
    titlePlural: "Permittivities",
    description:
      "The electric displacement per unit electric field strength in a material.",
    units: [
      {
        title: "Farad per Meter",
        titlePlural: "Farads per Meter",
        symbol: "F/m",
        description: "The coherent SI unit used to express permittivity.",
      },
    ],
  },
  {
    title: "Magnetic Permeability",
    titlePlural: "Magnetic Permeabilities",
    description:
      "The magnetic flux density per unit magnetic field strength in a material.",
    units: [
      {
        title: "Henry per Meter",
        titlePlural: "Henries per Meter",
        symbol: "H/m",
        description:
          "The coherent SI unit used to express magnetic permeability.",
      },
    ],
  },
  {
    title: "Fluid Permeability",
    titlePlural: "Fluid Permeabilities",
    description:
      "The intrinsic ability of a porous material to transmit fluids, independent of the fluid's properties.",
    sharedUnits: [
      systemDataTypes.squareMetres.dataTypeBaseUrl,
      systemDataTypes.squareCentimetres.dataTypeBaseUrl,
      systemDataTypes.squareMillimeter.dataTypeBaseUrl,
      systemDataTypes.squareMicrometer.dataTypeBaseUrl,
      systemDataTypes.squareFeet.dataTypeBaseUrl,
      systemDataTypes.squareInch.dataTypeBaseUrl,
    ],
    units: fluidPermeabilityUnits,
  },
  {
    title: "Molar Energy",
    titlePlural: "Molar Energies",
    description: "Energy per unit amount of substance.",
    units: [
      {
        title: "Joule per Mole",
        titlePlural: "Joules per Mole",
        symbol: "J/mol",
        description: "The coherent SI unit used to express molar energy.",
      },
    ],
  },
  {
    title: "Molar Heat Capacity",
    titlePlural: "Molar Heat Capacities",
    description:
      "Heat capacity per unit amount of substance; the same unit also expresses molar entropy.",
    units: [
      {
        title: "Joule per Mole Kelvin",
        titlePlural: "Joules per Mole Kelvin",
        symbol: "J/(mol·K)",
        description:
          "The coherent SI unit used to express molar heat capacity.",
      },
    ],
  },
  {
    title: "Radiation Exposure",
    titlePlural: "Radiation Exposures",
    description:
      "Electric charge produced by ionizing radiation per unit mass of air.",
    units: [
      {
        title: "Coulomb per Kilogram",
        titlePlural: "Coulombs per Kilogram",
        symbol: "C/kg",
        description: "The coherent SI unit used to express radiation exposure.",
      },
    ],
  },
  {
    title: "Absorbed Dose Rate",
    titlePlural: "Absorbed Dose Rates",
    description: "Absorbed radiation dose per unit time.",
    units: [
      {
        title: "Gray per Second",
        titlePlural: "Grays per Second",
        symbol: "Gy/s",
        description: "The coherent SI unit used to express absorbed dose rate.",
      },
    ],
  },
  {
    title: "Radiant Intensity",
    titlePlural: "Radiant Intensities",
    description: "Radiant power per unit solid angle.",
    units: [
      {
        title: "Watt per Steradian",
        titlePlural: "Watts per Steradian",
        symbol: "W/sr",
        description: "The coherent SI unit used to express radiant intensity.",
      },
    ],
  },
  {
    title: "Radiance",
    titlePlural: "Radiances",
    description: "Radiant power per unit projected area per unit solid angle.",
    units: [
      {
        dataTypeBaseUrl:
          systemDataTypes.wattPerSquareMeterSteradian.dataTypeBaseUrl,
        title: "Watt per Square Meter Steradian",
        titlePlural: "Watts per Square Meter Steradian",
        symbol: "W/(m²·sr)",
        description: "The coherent SI unit used to express radiance.",
      },
    ],
  },
  {
    title: "Catalytic Activity Concentration",
    titlePlural: "Catalytic Activity Concentrations",
    description: "Catalytic activity per unit volume.",
    units: [
      {
        title: "Katal per Cubic Meter",
        titlePlural: "Katals per Cubic Meter",
        symbol: "kat/m³",
        description:
          "The coherent SI unit used to express catalytic activity concentration.",
      },
    ],
  },
];

export const siUnitGroups: SiUnitGroup[] = unprefixedGroups.map((group) => ({
  ...group,
  units: [
    ...expandSiPrefixes(group.units),
    ...(imperialUnits[group.title] ?? []),
  ],
}));

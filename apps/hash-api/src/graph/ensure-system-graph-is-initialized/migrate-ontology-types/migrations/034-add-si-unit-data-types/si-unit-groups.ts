import { expandSiPrefixes } from "./si-unit-groups/expand-si-prefixes";

export type SiUnitDefinition = {
  title: string;
  description: string;
  symbol: string;
  minimum?: number;
  conversion?: {
    target: string;
    factor?: number;
    divisor?: number;
    inputOffset?: number;
    offset?: number;
  };
};

type SiUnitGroup = {
  title: string;
  description: string;
  units: SiUnitDefinition[];
};

const unprefixedGroups: SiUnitGroup[] = [
  {
    title: "Metric Length (SI)",
    description:
      "A measure of distance in the International System of Units (SI), the international standard for decimal-based measurements.",
    units: [
      {
        title: "Meters",
        description:
          "The base unit of length in the International System of Units (SI).",
        symbol: "m",
      },
      {
        title: "Millimeters",
        description:
          "A unit of length in the International System of Units (SI), equal to one thousandth of a meter.",
        symbol: "mm",
        conversion: {
          target: "Meters",
          factor: 0.001,
        },
      },
      {
        title: "Centimeters",
        description:
          "A unit of length in the International System of Units (SI), equal to one hundredth of a meter.",
        symbol: "cm",
        conversion: {
          target: "Meters",
          factor: 0.01,
        },
      },
      {
        title: "Kilometers",
        description:
          "A unit of length in the International System of Units (SI), equal to one thousand meters.",
        symbol: "km",
        conversion: {
          target: "Meters",
          factor: 1000,
        },
      },
    ],
  },
  {
    title: "Mass",
    description: "A measure of the amount of matter in an object.",
    units: [
      {
        title: "Kilograms",
        description: "The SI base unit of mass, equal to 1000 grams.",
        symbol: "kg",
      },
      {
        title: "Grams",
        description:
          "A metric unit of mass equal to one thousandth of a kilogram.",
        symbol: "g",
        conversion: {
          target: "Kilograms",
          factor: 0.001,
        },
      },
    ],
  },
  {
    title: "Duration",
    description: "A measure of the length of time.",
    units: [
      {
        title: "Second",
        description:
          "The base unit of duration in the International System of Units (SI), defined as about 9 billion oscillations of the caesium atom.",
        symbol: "s",
      },
      {
        title: "Millisecond",
        description:
          "A measure of the length of time in the International System of Units (SI), defined as exactly 1/1000 of a second.",
        symbol: "ms",
        conversion: {
          target: "Second",
          factor: 0.001,
        },
      },
      {
        title: "Microsecond",
        description:
          "A measure of the length of time in the International System of Units (SI), defined as exactly 1/1000000 (1 millionth) of a second.",
        symbol: "µs",
        conversion: {
          target: "Second",
          factor: 0.000001,
        },
      },
    ],
  },
  {
    title: "Frequency",
    description:
      "The number of occurrences of a repeating event per unit of time (temporal frequency).",
    units: [
      {
        title: "Hertz",
        description:
          "A unit of frequency in the International System of Units (SI), equivalent to one cycle per second.",
        symbol: "Hz",
      },
      {
        title: "Kilohertz",
        description:
          "A unit of frequency in the International System of Units (SI), equal to one thousand hertz.",
        symbol: "kHz",
        conversion: {
          target: "Hertz",
          factor: 1000,
        },
      },
      {
        title: "Megahertz",
        description:
          "A unit of frequency in the International System of Units (SI), equal to one million hertz.",
        symbol: "MHz",
        conversion: {
          target: "Hertz",
          factor: 1000000,
        },
      },
      {
        title: "Gigahertz",
        description:
          "A unit of frequency in the International System of Units (SI), equal to one billion hertz.",
        symbol: "GHz",
        conversion: {
          target: "Hertz",
          factor: 1000000000,
        },
      },
    ],
  },
  {
    title: "Power",
    description: "The amount of energy transferred or converted per unit time.",
    units: [
      {
        title: "Watts",
        description:
          "The unit of power or radiant flux in the International System of Units (SI) – the rate at which work is done or energy is transferred. Equal to one joule per second.",
        symbol: "W",
      },
      {
        title: "Kilowatts",
        description:
          "A unit of power in the International System of Units (SI), equal to one thousand watts.",
        symbol: "kW",
        conversion: {
          target: "Watts",
          factor: 1000,
        },
      },
      {
        title: "Megawatts",
        description:
          "A unit of power in the International System of Units (SI), equal to one million watts.",
        symbol: "MW",
        conversion: {
          target: "Watts",
          factor: 1000000,
        },
      },
      {
        title: "Gigawatts",
        description:
          "A unit of power in the International System of Units (SI), equal to one billion watts.",
        symbol: "GW",
        conversion: {
          target: "Watts",
          factor: 1000000000,
        },
      },
    ],
  },
  {
    title: "Area",
    description: "A measure of the extent of a two-dimensional surface.",
    units: [
      {
        title: "Square Metres",
        description:
          "A metric unit of area equal to a square one metre on each side.",
        symbol: "m²",
      },
      {
        title: "Square Centimetres",
        description:
          "A metric unit of area equal to one ten-thousandth of a square metre.",
        symbol: "cm²",
        conversion: {
          target: "Square Metres",
          factor: 0.0001,
        },
      },
    ],
  },
  {
    title: "Volume",
    description:
      "A measure of the three-dimensional space occupied by something.",
    units: [
      {
        title: "Litres",
        description: "A metric unit of volume equal to one cubic decimetre.",
        symbol: "L",
      },
      {
        title: "Millilitres",
        description:
          "A metric unit of volume equal to one thousandth of a litre.",
        symbol: "mL",
        conversion: {
          target: "Litres",
          factor: 0.001,
        },
      },
      {
        title: "Cubic Metres",
        description: "A metric unit of volume equal to 1000 litres.",
        symbol: "m³",
        conversion: {
          target: "Litres",
          factor: 1000,
        },
      },
    ],
  },
  {
    title: "Electric Current",
    description: "The rate of flow of electric charge.",
    units: [
      {
        title: "Amperes",
        symbol: "A",
        description: "The SI base unit of electric current.",
      },
      {
        title: "Milliamperes",
        symbol: "mA",
        description: "A unit of electric current equal to 0.001 amperes.",
        conversion: {
          target: "Amperes",
          factor: 0.001,
        },
      },
      {
        title: "Microamperes",
        symbol: "µA",
        description: "A unit of electric current equal to 0.000001 amperes.",
        conversion: {
          target: "Amperes",
          factor: 1e-6,
        },
      },
    ],
  },
  {
    title: "Temperature",
    description:
      "A measure of temperature on an absolute or offset temperature scale.",
    units: [
      {
        title: "Kelvins",
        symbol: "K",
        description:
          "The SI base unit of thermodynamic temperature, measured from absolute zero.",
        minimum: 0,
      },
      {
        title: "Degrees Celsius",
        symbol: "°C",
        description:
          "A unit of Celsius temperature. Add 273.15 to obtain the temperature in kelvins.",
        conversion: {
          target: "Kelvins",
          offset: 273.15,
        },
        minimum: -273.15,
      },
      {
        title: "Degrees Fahrenheit",
        symbol: "°F",
        description:
          "A unit of Fahrenheit temperature. Absolute zero is −459.67 °F.",
        conversion: {
          target: "Kelvins",
          factor: 5,
          divisor: 9,
          inputOffset: 459.67,
        },
        minimum: -459.67,
      },
    ],
  },
  {
    title: "Amount of Substance",
    description:
      "A measure of the number of specified elementary entities in a sample.",
    units: [
      {
        title: "Moles",
        symbol: "mol",
        description:
          "The SI base unit of amount of substance. One mole contains exactly 6.02214076 × 10²³ specified elementary entities.",
      },
      {
        title: "Millimoles",
        symbol: "mmol",
        description: "A unit of amount of substance equal to 0.001 moles.",
        conversion: {
          target: "Moles",
          factor: 0.001,
        },
      },
      {
        title: "Micromoles",
        symbol: "µmol",
        description: "A unit of amount of substance equal to 0.000001 moles.",
        conversion: {
          target: "Moles",
          factor: 1e-6,
        },
      },
    ],
  },
  {
    title: "Luminous Intensity",
    description:
      "The luminous flux emitted per unit solid angle in a given direction.",
    units: [
      {
        title: "Candelas",
        symbol: "cd",
        description: "The SI base unit of luminous intensity.",
      },
    ],
  },
  {
    title: "Angle",
    description:
      "A measure of rotation or the space between two intersecting lines.",
    units: [
      {
        title: "Degree",
        symbol: "°",
        description:
          "A unit of angular measure equal to 1/360 of a full rotation.",
      },
      {
        title: "Radians",
        symbol: "rad",
        description: "The SI unit of plane angle. A full turn is 2π radians.",
        conversion: {
          target: "Degree",
          factor: 180,
          divisor: 3.141592653589793,
        },
      },
    ],
  },
  {
    title: "Solid Angle",
    description:
      "A measure of the angular extent of a surface as seen from a point.",
    units: [
      {
        title: "Steradians",
        symbol: "sr",
        description:
          "The SI unit of solid angle. A complete sphere subtends 4π steradians.",
      },
    ],
  },
  {
    title: "Force",
    description: "A measure of an interaction that changes momentum.",
    units: [
      {
        title: "Newtons",
        symbol: "N",
        description:
          "The SI unit of force, equal to one kilogram metre per second squared.",
      },
      {
        title: "Kilonewtons",
        symbol: "kN",
        description: "A unit of force equal to 1000 newtons.",
        conversion: {
          target: "Newtons",
          factor: 1000,
        },
      },
    ],
  },
  {
    title: "Pressure",
    description: "Force applied per unit area, also used to express stress.",
    units: [
      {
        title: "Pascals",
        symbol: "Pa",
        description:
          "The SI unit of pressure and stress, equal to one newton per square metre.",
      },
      {
        title: "Hectopascals",
        symbol: "hPa",
        description: "A unit of pressure equal to 100 pascals.",
        conversion: {
          target: "Pascals",
          factor: 100,
        },
      },
      {
        title: "Kilopascals",
        symbol: "kPa",
        description: "A unit of pressure equal to 1000 pascals.",
        conversion: {
          target: "Pascals",
          factor: 1000,
        },
      },
      {
        title: "Megapascals",
        symbol: "MPa",
        description: "A unit of pressure equal to 1000000 pascals.",
        conversion: {
          target: "Pascals",
          factor: 1000000,
        },
      },
      {
        title: "Bars",
        symbol: "bar",
        description: "A unit of pressure equal to 100000 pascals.",
        conversion: {
          target: "Pascals",
          factor: 100000,
        },
      },
      {
        title: "Standard Atmospheres",
        symbol: "atm",
        description: "A unit of pressure equal to 101325 pascals.",
        conversion: {
          target: "Pascals",
          factor: 101325,
        },
      },
    ],
  },
  {
    title: "Energy",
    description: "A measure of energy, work, or heat.",
    units: [
      {
        title: "Joules",
        symbol: "J",
        description:
          "The SI unit of energy, work, and heat, equal to one newton metre.",
      },
      {
        title: "Kilojoules",
        symbol: "kJ",
        description: "A unit of energy equal to 1000 joules.",
        conversion: {
          target: "Joules",
          factor: 1000,
        },
      },
      {
        title: "Megajoules",
        symbol: "MJ",
        description: "A unit of energy equal to 1000000 joules.",
        conversion: {
          target: "Joules",
          factor: 1000000,
        },
      },
      {
        title: "Watt Hours",
        symbol: "W·h",
        description: "A unit of energy equal to 3600 joules.",
        conversion: {
          target: "Joules",
          factor: 3600,
        },
      },
      {
        title: "Kilowatt Hours",
        symbol: "kW·h",
        description: "A unit of energy equal to 3600000 joules.",
        conversion: {
          target: "Joules",
          factor: 3600000,
        },
      },
    ],
  },
  {
    title: "Electric Charge",
    description: "A measure of electric charge.",
    units: [
      {
        title: "Coulombs",
        symbol: "C",
        description:
          "The SI unit of electric charge, equal to one ampere second.",
      },
      {
        title: "Ampere Hours",
        symbol: "A·h",
        description: "A unit of electric charge equal to 3600 coulombs.",
        conversion: {
          target: "Coulombs",
          factor: 3600,
        },
      },
      {
        title: "Milliampere Hours",
        symbol: "mA·h",
        description: "A unit of electric charge equal to 3.6 coulombs.",
        conversion: {
          target: "Coulombs",
          factor: 3.6,
        },
      },
    ],
  },
  {
    title: "Electric Potential Difference",
    description:
      "The energy transferred per unit electric charge between two points.",
    units: [
      {
        title: "Volts",
        symbol: "V",
        description:
          "The SI unit of electric potential difference and electromotive force, equal to one watt per ampere.",
      },
      {
        title: "Millivolts",
        symbol: "mV",
        description:
          "A unit of electric potential difference equal to 0.001 volts.",
        conversion: {
          target: "Volts",
          factor: 0.001,
        },
      },
      {
        title: "Kilovolts",
        symbol: "kV",
        description:
          "A unit of electric potential difference equal to 1000 volts.",
        conversion: {
          target: "Volts",
          factor: 1000,
        },
      },
    ],
  },
  {
    title: "Capacitance",
    description:
      "The electric charge stored per unit electric potential difference.",
    units: [
      {
        title: "Farads",
        symbol: "F",
        description:
          "The SI unit of capacitance, equal to one coulomb per volt.",
      },
      {
        title: "Microfarads",
        symbol: "µF",
        description: "A unit of capacitance equal to 1e-06 farads.",
        conversion: {
          target: "Farads",
          factor: 1e-6,
        },
      },
      {
        title: "Nanofarads",
        symbol: "nF",
        description: "A unit of capacitance equal to 1e-09 farads.",
        conversion: {
          target: "Farads",
          factor: 1e-9,
        },
      },
      {
        title: "Picofarads",
        symbol: "pF",
        description: "A unit of capacitance equal to 1e-12 farads.",
        conversion: {
          target: "Farads",
          factor: 1e-12,
        },
      },
    ],
  },
  {
    title: "Electric Resistance",
    description:
      "The ratio of electric potential difference to electric current.",
    units: [
      {
        title: "Ohms",
        symbol: "Ω",
        description:
          "The SI unit of electric resistance, equal to one volt per ampere.",
      },
      {
        title: "Kilohms",
        symbol: "kΩ",
        description: "A unit of electric resistance equal to 1000 ohms.",
        conversion: {
          target: "Ohms",
          factor: 1000,
        },
      },
      {
        title: "Megohms",
        symbol: "MΩ",
        description: "A unit of electric resistance equal to 1000000 ohms.",
        conversion: {
          target: "Ohms",
          factor: 1000000,
        },
      },
    ],
  },
  {
    title: "Electric Conductance",
    description:
      "The ratio of electric current to electric potential difference.",
    units: [
      {
        title: "Siemens",
        symbol: "S",
        description:
          "The SI unit of electric conductance, equal to one ampere per volt.",
      },
    ],
  },
  {
    title: "Magnetic Flux",
    description: "The magnetic flux density integrated over a surface.",
    units: [
      {
        title: "Webers",
        symbol: "Wb",
        description: "The SI unit of magnetic flux, equal to one volt second.",
      },
    ],
  },
  {
    title: "Magnetic Flux Density",
    description: "A measure of magnetic flux per unit area.",
    units: [
      {
        title: "Teslas",
        symbol: "T",
        description:
          "The SI unit of magnetic flux density, equal to one weber per square metre.",
      },
      {
        title: "Milliteslas",
        symbol: "mT",
        description: "A unit of magnetic flux density equal to 0.001 teslas.",
        conversion: {
          target: "Teslas",
          factor: 0.001,
        },
      },
      {
        title: "Microteslas",
        symbol: "µT",
        description:
          "A unit of magnetic flux density equal to 0.000001 teslas.",
        conversion: {
          target: "Teslas",
          factor: 1e-6,
        },
      },
    ],
  },
  {
    title: "Inductance",
    description: "The magnetic flux linkage per unit electric current.",
    units: [
      {
        title: "Henries",
        symbol: "H",
        description:
          "The SI unit of inductance, equal to one weber per ampere.",
      },
      {
        title: "Millihenries",
        symbol: "mH",
        description: "A unit of inductance equal to 0.001 henries.",
        conversion: {
          target: "Henries",
          factor: 0.001,
        },
      },
    ],
  },
  {
    title: "Luminous Flux",
    description:
      "A measure of light output weighted by human visual sensitivity.",
    units: [
      {
        title: "Lumens",
        symbol: "lm",
        description:
          "The SI unit of luminous flux, equal to one candela steradian.",
      },
    ],
  },
  {
    title: "Illuminance",
    description: "The luminous flux incident per unit area.",
    units: [
      {
        title: "Lux",
        symbol: "lx",
        description:
          "The SI unit of illuminance, equal to one lumen per square metre.",
      },
    ],
  },
  {
    title: "Radionuclide Activity",
    description:
      "The rate of spontaneous nuclear transformations in a radioactive sample.",
    units: [
      {
        title: "Becquerels",
        symbol: "Bq",
        description:
          "The SI unit of radionuclide activity, equal to one nuclear transformation per second.",
      },
      {
        title: "Kilobecquerels",
        symbol: "kBq",
        description:
          "A unit of radionuclide activity equal to 1000 becquerels.",
        conversion: {
          target: "Becquerels",
          factor: 1000,
        },
      },
    ],
  },
  {
    title: "Absorbed Dose",
    description: "The energy imparted by ionizing radiation per unit mass.",
    units: [
      {
        title: "Grays",
        symbol: "Gy",
        description:
          "The SI unit of absorbed dose and kerma, equal to one joule per kilogram.",
      },
      {
        title: "Milligrays",
        symbol: "mGy",
        description: "A unit of absorbed dose equal to 0.001 grays.",
        conversion: {
          target: "Grays",
          factor: 0.001,
        },
      },
    ],
  },
  {
    title: "Dose Equivalent",
    description:
      "The absorbed radiation dose weighted for its biological effect.",
    units: [
      {
        title: "Sieverts",
        symbol: "Sv",
        description:
          "The SI unit of dose equivalent, expressed as one joule per kilogram after radiation weighting.",
      },
      {
        title: "Millisieverts",
        symbol: "mSv",
        description: "A unit of dose equivalent equal to 0.001 sieverts.",
        conversion: {
          target: "Sieverts",
          factor: 0.001,
        },
      },
      {
        title: "Microsieverts",
        symbol: "µSv",
        description: "A unit of dose equivalent equal to 0.000001 sieverts.",
        conversion: {
          target: "Sieverts",
          factor: 1e-6,
        },
      },
    ],
  },
  {
    title: "Catalytic Activity",
    description:
      "The rate of conversion of a specified substance in a catalysed reaction.",
    units: [
      {
        title: "Katals",
        symbol: "kat",
        description:
          "The SI unit of catalytic activity, equal to one mole per second.",
      },
    ],
  },
  {
    title: "Speed",
    description:
      "A measure of the rate of movement or change in position over time.",
    units: [
      {
        title: "Meters per Second",
        symbol: "m/s",
        description:
          "The SI unit of speed, expressing the number of meters traveled in one second.",
      },
      {
        title: "Kilometers per Hour",
        symbol: "km/h",
        description:
          "A unit of speed expressing the number of kilometers traveled in one hour.",
        conversion: {
          target: "Meters per Second",
          factor: 5,
          divisor: 18,
        },
      },
    ],
  },
  {
    title: "Acceleration",
    description: "The rate of change of velocity.",
    units: [
      {
        title: "Meters per Second Squared",
        symbol: "m/s²",
        description: "The coherent SI unit used to express acceleration.",
      },
    ],
  },
  {
    title: "Wavenumber",
    description: "The number of spatial cycles per unit length.",
    units: [
      {
        title: "Reciprocal Meters",
        symbol: "m⁻¹",
        description: "The coherent SI unit used to express wavenumber.",
      },
    ],
  },
  {
    title: "Mass Density",
    description:
      "Mass per unit volume, also used to express mass concentration.",
    units: [
      {
        title: "Kilograms per Cubic Meter",
        symbol: "kg/m³",
        description: "The coherent SI unit used to express mass density.",
      },
      {
        title: "Grams per Cubic Centimeter",
        symbol: "g/cm³",
        description:
          "A unit of mass density equal to 1000 kilograms per cubic meter.",
        conversion: {
          target: "Kilograms per Cubic Meter",
          factor: 1000,
        },
      },
    ],
  },
  {
    title: "Surface Density",
    description: "Mass per unit area.",
    units: [
      {
        title: "Kilograms per Square Meter",
        symbol: "kg/m²",
        description: "The coherent SI unit used to express surface density.",
      },
    ],
  },
  {
    title: "Specific Volume",
    description: "Volume per unit mass.",
    units: [
      {
        title: "Cubic Meters per Kilogram",
        symbol: "m³/kg",
        description: "The coherent SI unit used to express specific volume.",
      },
    ],
  },
  {
    title: "Electric Current Density",
    description: "Electric current per unit area.",
    units: [
      {
        title: "Amperes per Square Meter",
        symbol: "A/m²",
        description:
          "The coherent SI unit used to express electric current density.",
      },
    ],
  },
  {
    title: "Magnetic Field Strength",
    description:
      "A measure of the magnetic field associated with electric currents and magnetization.",
    units: [
      {
        title: "Amperes per Meter",
        symbol: "A/m",
        description:
          "The coherent SI unit used to express magnetic field strength.",
      },
    ],
  },
  {
    title: "Amount Concentration",
    description: "Amount of substance per unit volume.",
    units: [
      {
        title: "Moles per Cubic Meter",
        symbol: "mol/m³",
        description:
          "The coherent SI unit used to express amount concentration.",
      },
      {
        title: "Moles per Litre",
        symbol: "mol/L",
        description:
          "A unit of amount concentration equal to 1000 moles per cubic meter.",
        conversion: {
          target: "Moles per Cubic Meter",
          factor: 1000,
        },
      },
    ],
  },
  {
    title: "Luminance",
    description:
      "Luminous intensity per unit projected area in a given direction.",
    units: [
      {
        title: "Candelas per Square Meter",
        symbol: "cd/m²",
        description: "The coherent SI unit used to express luminance.",
      },
    ],
  },
  {
    title: "Dynamic Viscosity",
    description:
      "The ratio of shear stress to the velocity gradient in a fluid.",
    units: [
      {
        title: "Pascal Seconds",
        symbol: "Pa·s",
        description: "The coherent SI unit used to express dynamic viscosity.",
      },
      {
        title: "Millipascal Seconds",
        symbol: "mPa·s",
        description:
          "A unit of dynamic viscosity equal to 0.001 pascal seconds.",
        conversion: {
          target: "Pascal Seconds",
          factor: 0.001,
        },
      },
    ],
  },
  {
    title: "Torque",
    description: "The moment of a force about an axis.",
    units: [
      {
        title: "Newton Meters",
        symbol: "N·m",
        description: "The coherent SI unit used to express torque.",
      },
    ],
  },
  {
    title: "Surface Tension",
    description: "Force per unit length along a liquid interface.",
    units: [
      {
        title: "Newtons per Meter",
        symbol: "N/m",
        description: "The coherent SI unit used to express surface tension.",
      },
    ],
  },
  {
    title: "Angular Velocity",
    description:
      "The rate of change of angle, also used to express angular frequency.",
    units: [
      {
        title: "Radians per Second",
        symbol: "rad/s",
        description: "The coherent SI unit used to express angular velocity.",
      },
    ],
  },
  {
    title: "Angular Acceleration",
    description: "The rate of change of angular velocity.",
    units: [
      {
        title: "Radians per Second Squared",
        symbol: "rad/s²",
        description:
          "The coherent SI unit used to express angular acceleration.",
      },
    ],
  },
  {
    title: "Heat Flux Density",
    description:
      "Power transferred per unit area, also used to express irradiance.",
    units: [
      {
        title: "Watts per Square Meter",
        symbol: "W/m²",
        description: "The coherent SI unit used to express heat flux density.",
      },
    ],
  },
  {
    title: "Heat Capacity",
    description:
      "The heat transferred per unit temperature change; the same unit also expresses entropy.",
    units: [
      {
        title: "Joules per Kelvin",
        symbol: "J/K",
        description: "The coherent SI unit used to express heat capacity.",
      },
    ],
  },
  {
    title: "Specific Heat Capacity",
    description:
      "Heat capacity per unit mass; the same unit also expresses specific entropy.",
    units: [
      {
        title: "Joules per Kilogram Kelvin",
        symbol: "J/(kg·K)",
        description:
          "The coherent SI unit used to express specific heat capacity.",
      },
    ],
  },
  {
    title: "Specific Energy",
    description: "Energy per unit mass.",
    units: [
      {
        title: "Joules per Kilogram",
        symbol: "J/kg",
        description: "The coherent SI unit used to express specific energy.",
      },
    ],
  },
  {
    title: "Thermal Conductivity",
    description: "The heat flux density per unit temperature gradient.",
    units: [
      {
        title: "Watts per Meter Kelvin",
        symbol: "W/(m·K)",
        description:
          "The coherent SI unit used to express thermal conductivity.",
      },
    ],
  },
  {
    title: "Energy Density",
    description: "Energy per unit volume.",
    units: [
      {
        title: "Joules per Cubic Meter",
        symbol: "J/m³",
        description: "The coherent SI unit used to express energy density.",
      },
    ],
  },
  {
    title: "Electric Field Strength",
    description: "Force per unit electric charge.",
    units: [
      {
        title: "Volts per Meter",
        symbol: "V/m",
        description:
          "The coherent SI unit used to express electric field strength.",
      },
    ],
  },
  {
    title: "Electric Charge Density",
    description: "Electric charge per unit volume.",
    units: [
      {
        title: "Coulombs per Cubic Meter",
        symbol: "C/m³",
        description:
          "The coherent SI unit used to express electric charge density.",
      },
    ],
  },
  {
    title: "Surface Charge Density",
    description:
      "Electric charge per unit area; the same unit also expresses electric flux density.",
    units: [
      {
        title: "Coulombs per Square Meter",
        symbol: "C/m²",
        description:
          "The coherent SI unit used to express surface charge density.",
      },
    ],
  },
  {
    title: "Permittivity",
    description:
      "The electric displacement per unit electric field strength in a material.",
    units: [
      {
        title: "Farads per Meter",
        symbol: "F/m",
        description: "The coherent SI unit used to express permittivity.",
      },
    ],
  },
  {
    title: "Permeability",
    description:
      "The magnetic flux density per unit magnetic field strength in a material.",
    units: [
      {
        title: "Henries per Meter",
        symbol: "H/m",
        description:
          "The coherent SI unit used to express magnetic permeability.",
      },
    ],
  },
  {
    title: "Molar Energy",
    description: "Energy per unit amount of substance.",
    units: [
      {
        title: "Joules per Mole",
        symbol: "J/mol",
        description: "The coherent SI unit used to express molar energy.",
      },
    ],
  },
  {
    title: "Molar Heat Capacity",
    description:
      "Heat capacity per unit amount of substance; the same unit also expresses molar entropy.",
    units: [
      {
        title: "Joules per Mole Kelvin",
        symbol: "J/(mol·K)",
        description:
          "The coherent SI unit used to express molar heat capacity.",
      },
    ],
  },
  {
    title: "Radiation Exposure",
    description:
      "Electric charge produced by ionizing radiation per unit mass of air.",
    units: [
      {
        title: "Coulombs per Kilogram",
        symbol: "C/kg",
        description: "The coherent SI unit used to express radiation exposure.",
      },
    ],
  },
  {
    title: "Absorbed Dose Rate",
    description: "Absorbed radiation dose per unit time.",
    units: [
      {
        title: "Grays per Second",
        symbol: "Gy/s",
        description: "The coherent SI unit used to express absorbed dose rate.",
      },
    ],
  },
  {
    title: "Radiant Intensity",
    description: "Radiant power per unit solid angle.",
    units: [
      {
        title: "Watts per Steradian",
        symbol: "W/sr",
        description: "The coherent SI unit used to express radiant intensity.",
      },
    ],
  },
  {
    title: "Radiance",
    description: "Radiant power per unit projected area per unit solid angle.",
    units: [
      {
        title: "Watts per Square Meter Steradian",
        symbol: "W/(m²·sr)",
        description: "The coherent SI unit used to express radiance.",
      },
    ],
  },
  {
    title: "Catalytic Activity Concentration",
    description: "Catalytic activity per unit volume.",
    units: [
      {
        title: "Katals per Cubic Meter",
        symbol: "kat/m³",
        description:
          "The coherent SI unit used to express catalytic activity concentration.",
      },
    ],
  },
];

export const siUnitGroups: SiUnitGroup[] = unprefixedGroups.map((group) => ({
  ...group,
  units: expandSiPrefixes(group.units),
}));

import type { SiUnitDefinition } from "../si-unit-groups";

const prefixes = [
  { name: "quetta", symbol: "Q", exponent: 30 },
  { name: "ronna", symbol: "R", exponent: 27 },
  { name: "yotta", symbol: "Y", exponent: 24 },
  { name: "zetta", symbol: "Z", exponent: 21 },
  { name: "exa", symbol: "E", exponent: 18 },
  { name: "peta", symbol: "P", exponent: 15 },
  { name: "tera", symbol: "T", exponent: 12 },
  { name: "giga", symbol: "G", exponent: 9 },
  { name: "mega", symbol: "M", exponent: 6 },
  { name: "kilo", symbol: "k", exponent: 3 },
  { name: "hecto", symbol: "h", exponent: 2 },
  { name: "deca", symbol: "da", exponent: 1 },
  { name: "deci", symbol: "d", exponent: -1 },
  { name: "centi", symbol: "c", exponent: -2 },
  { name: "milli", symbol: "m", exponent: -3 },
  { name: "micro", symbol: "µ", exponent: -6 },
  { name: "nano", symbol: "n", exponent: -9 },
  { name: "pico", symbol: "p", exponent: -12 },
  { name: "femto", symbol: "f", exponent: -15 },
  { name: "atto", symbol: "a", exponent: -18 },
  { name: "zepto", symbol: "z", exponent: -21 },
  { name: "yocto", symbol: "y", exponent: -24 },
  { name: "ronto", symbol: "r", exponent: -27 },
  { name: "quecto", symbol: "q", exponent: -30 },
];

const prefixableUnits = new Set([
  "Meters",
  "Grams",
  "Second",
  "Amperes",
  "Kelvins",
  "Moles",
  "Candelas",
  "Radians",
  "Steradians",
  "Hertz",
  "Newtons",
  "Pascals",
  "Joules",
  "Watts",
  "Coulombs",
  "Volts",
  "Farads",
  "Ohms",
  "Siemens",
  "Webers",
  "Teslas",
  "Henries",
  "Lumens",
  "Lux",
  "Becquerels",
  "Grays",
  "Sieverts",
  "Katals",
  "Ampere Hours",
  "Watt Hours",
  "Litres",
  "Square Metres",
  "Cubic Metres",
]);

export const expandSiPrefixes = (
  units: SiUnitDefinition[],
): SiUnitDefinition[] => {
  const titles = new Set(units.map(({ title }) => title));
  const expanded = [...units];

  for (const unit of units) {
    if (!prefixableUnits.has(unit.title)) {
      continue;
    }

    const power =
      unit.title === "Square Metres"
        ? 2
        : unit.title === "Cubic Metres"
          ? 3
          : 1;
    const name = power === 1 ? unit.title : "Metres";
    const titlePrefix = power === 2 ? "Square " : power === 3 ? "Cubic " : "";

    for (const prefix of prefixes) {
      const prefixedName =
        unit.title === "Ohms" && prefix.name === "kilo"
          ? "kilohms"
          : unit.title === "Ohms" && prefix.name === "mega"
            ? "megohms"
            : `${prefix.name}${name.charAt(0).toLowerCase()}${name.slice(1)}`;
      const title = `${titlePrefix}${prefixedName.charAt(0).toUpperCase()}${prefixedName.slice(1)}`;
      if (titles.has(title)) {
        continue;
      }

      const scale = Number(`1e${prefix.exponent * power}`);
      const conversion = unit.conversion ?? { target: unit.title };
      const [coefficient, exponent] = (conversion.factor ?? 1)
        .toExponential()
        .split("e");
      expanded.push({
        title,
        symbol: `${prefix.symbol}${unit.symbol}`,
        description: `A unit equal to 10^${prefix.exponent * power} ${unit.title.toLowerCase()}.`,
        ...(unit.minimum === undefined
          ? {}
          : { minimum: unit.minimum / scale }),
        conversion: {
          ...conversion,
          factor: Number(
            `${coefficient}e${Number(exponent) + prefix.exponent * power}`,
          ),
        },
      });
      titles.add(title);
    }
  }

  return expanded;
};

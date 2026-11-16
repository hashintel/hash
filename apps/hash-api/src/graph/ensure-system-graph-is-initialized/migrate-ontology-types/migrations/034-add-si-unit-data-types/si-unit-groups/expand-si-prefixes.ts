import { systemDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { scaledConversion } from "../shared/conversions";

import type { SiUnitDefinition } from "../si-unit-groups";
import type { BaseUrl, Conversions } from "@blockprotocol/type-system";

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

const prefixableUnits = new Map<string, BaseUrl>(
  [
    systemDataTypes.meters,
    systemDataTypes.grams,
    systemDataTypes.second,
    systemDataTypes.amperes,
    systemDataTypes.kelvins,
    systemDataTypes.moles,
    systemDataTypes.candelas,
    systemDataTypes.radians,
    systemDataTypes.steradians,
    systemDataTypes.hertz,
    systemDataTypes.newtons,
    systemDataTypes.pascals,
    systemDataTypes.joules,
    systemDataTypes.watts,
    systemDataTypes.coulombs,
    systemDataTypes.volts,
    systemDataTypes.farads,
    systemDataTypes.ohms,
    systemDataTypes.siemens,
    systemDataTypes.webers,
    systemDataTypes.teslas,
    systemDataTypes.henries,
    systemDataTypes.lumens,
    systemDataTypes.lux,
    systemDataTypes.becquerels,
    systemDataTypes.grays,
    systemDataTypes.sieverts,
    systemDataTypes.katals,
    systemDataTypes.ampereHours,
    systemDataTypes.wattHours,
    systemDataTypes.litres,
    systemDataTypes.squareMetres,
    systemDataTypes.cubicMetres,
  ].map(({ title, dataTypeBaseUrl }) => [title, dataTypeBaseUrl]),
);

const prefixConversion = (
  conversion: Conversions,
  exponent: number,
): Conversions => {
  const [operator, dividend, divisor] = conversion.to.expression;
  if (
    operator !== "/" ||
    !Array.isArray(dividend) ||
    dividend[0] !== "*" ||
    dividend[1] !== "self" ||
    typeof dividend[2] !== "object" ||
    Array.isArray(dividend[2]) ||
    typeof divisor !== "object" ||
    Array.isArray(divisor)
  ) {
    throw new Error("SI prefixes require a multiplicative conversion");
  }
  const factor = dividend[2].const;
  if (
    JSON.stringify(conversion.from) !==
    JSON.stringify(scaledConversion(factor, divisor.const).from)
  ) {
    throw new Error("SI prefix conversion has an inconsistent inverse");
  }
  const [coefficient, originalExponent] = factor.toExponential().split("e");
  return scaledConversion(
    Number(`${coefficient}e${Number(originalExponent) + exponent}`),
    divisor.const,
  );
};

export const expandSiPrefixes = (
  units: SiUnitDefinition[],
): SiUnitDefinition[] => {
  const titles = new Set(units.map(({ title }) => title));
  const expanded = [...units];

  for (const unit of units) {
    const baseUrl = prefixableUnits.get(unit.title);
    if (!baseUrl) {
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
      const conversions = unit.conversions ?? {
        [baseUrl]: scaledConversion(1),
      };
      expanded.push({
        title,
        symbol: `${prefix.symbol}${unit.symbol}`,
        description: `A unit equal to 10^${prefix.exponent * power} ${unit.title.toLowerCase()}.`,
        ...(unit.minimum === undefined
          ? {}
          : { minimum: unit.minimum / scale }),
        conversions: Object.fromEntries(
          Object.entries(conversions).map(([target, conversion]) => [
            target,
            prefixConversion(conversion, prefix.exponent * power),
          ]),
        ),
      });
      titles.add(title);
    }
  }

  return expanded;
};

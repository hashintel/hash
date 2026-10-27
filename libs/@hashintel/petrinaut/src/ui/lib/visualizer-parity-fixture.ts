/**
 * Inputs the parity fixture is rendered with: deterministic tokens for a
 * colour and the net's default parameter values. Shared by the fixture
 * generator and the parity test, so both sides draw the same frame.
 */
import type { Color, SDCPN } from "@hashintel/petrinaut-core";

export type FixtureToken = Record<string, number | boolean | bigint | string>;

/** Three tokens whose attribute values differ per index, so overlapping shapes separate. */
export const sampleTokens = (color: Color): FixtureToken[] =>
  [0, 1, 2].map((index) => {
    const token: FixtureToken = {};
    for (const [position, element] of color.elements.entries()) {
      switch (element.type) {
        case "real":
          token[element.name] = 10.5 + index * 7.25 + position * 3.5;
          break;
        case "integer":
          token[element.name] = index + position;
          break;
        case "boolean":
          token[element.name] = (index + position) % 2 === 0;
          break;
        case "string":
          token[element.name] = `${element.name}-${index}`;
          break;
        case "uuid":
          token[element.name] = BigInt(index + 1);
          break;
      }
    }
    return token;
  });

/** The net's parameters at their default values. */
export const sampleParameters = (
  sdcpn: SDCPN,
): Record<string, number | boolean> =>
  Object.fromEntries(
    sdcpn.parameters.map((parameter) => [
      parameter.variableName,
      parameter.type === "boolean"
        ? parameter.defaultValue === "true"
        : Number(parameter.defaultValue),
    ]),
  );

import type { ScenarioParameter } from "../../../types/sdcpn";

/**
 * A scenario parameter's value as `scenario.<identifier>` reads it. Values
 * travel as numbers, a boolean parameter's as 0/1: it binds as
 * `false`/`true`, every other type binds its number as it is. The scenario
 * compiler and a constraint over the scenario apply this one rule.
 */
export const decodeScenarioParameterValue = (
  parameter: Pick<ScenarioParameter, "type">,
  value: number,
): number | boolean => (parameter.type === "boolean" ? value !== 0 : value);

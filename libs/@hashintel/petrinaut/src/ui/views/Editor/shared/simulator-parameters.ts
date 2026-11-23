import {
  resolveSimulatorParameters,
  type SimulatorParameterSpec,
  type SimulatorParameterSpecs,
  type StoredSimulatorParameters,
} from "@hashintel/petrinaut-core";

/**
 * The parameters of a spec a form shows for the values it holds: every one
 * whose `enabledWhen` condition those values meet, in the spec's order.
 */
export const visibleSimulatorParameters = (
  specs: SimulatorParameterSpecs,
  values: StoredSimulatorParameters,
): [string, SimulatorParameterSpec][] =>
  Object.entries(specs).filter(([, spec]) => {
    const condition = spec.enabledWhen;
    if (!condition) {
      return true;
    }
    // A parameter nobody touched holds its default, and controls with it.
    const controlling = values[condition.key] ?? specs[condition.key]?.default;
    return (
      typeof controlling !== "number" &&
      controlling !== undefined &&
      condition.in.includes(controlling)
    );
  });

/**
 * Whether a spec takes `value` for `key` beside the values it already holds.
 * A form stores only what it takes, so its fields never hold what could not
 * run.
 */
export const acceptsSimulatorParameter = (
  specs: SimulatorParameterSpecs,
  values: StoredSimulatorParameters,
  key: string,
  value: number | boolean | string,
): boolean => resolveSimulatorParameters(specs, { ...values, [key]: value }).ok;

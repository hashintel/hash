import { runEndOf } from "../../../../../../../react/simulation/run-end";
import { visibleSimulatorParameters } from "../../../../../../components/simulator-parameter-input";

import type { SimulationMode } from "../../../../../../../react/simulators/context";
/**
 * The one-line reading of what Play computes, for the run settings picker:
 * the values a user set, in the order the popover lists them.
 */
import type {
  RunClock,
  SimulatorParameterSpec,
  SimulatorParameterSpecs,
  StoredSimulatorParameters,
} from "@hashintel/petrinaut-core";

/** A number as a field would show it, in exponent form when that is shorter. */
export const formatSettingNumber = (value: number): string => {
  const magnitude = Math.abs(value);
  if (value !== 0 && (magnitude < 1e-3 || magnitude >= 1e6)) {
    return value
      .toExponential(3)
      .replace(/\.?0+e/, "e")
      .replace("e+", "e");
  }
  return String(value);
};

const parameterDetail = (
  spec: SimulatorParameterSpec,
  stored: number | boolean | string | undefined,
): string | null => {
  if (spec.type === "boolean") {
    return (typeof stored === "boolean" ? stored : spec.default)
      ? spec.label
      : null;
  }
  if (spec.type === "enum") {
    const value = typeof stored === "string" ? stored : spec.default;
    return (
      spec.options.find((option) => option.value === value)?.label ?? value
    );
  }
  const value = formatSettingNumber(
    typeof stored === "number" ? stored : spec.default,
  );
  // A unit says what the number is; without one, the label has to.
  return spec.type === "number" && spec.unit
    ? `${value} ${spec.unit}`
    : `${spec.label} ${value}`;
};

/**
 * The details after the simulator's name: one per parameter it shows, then
 * the run count and the end of a Stochastic simulation.
 *
 * On a clock of steps the simulator's parameters are not used, so the
 * details say how the net is stepped in their place, and the end is a step.
 */
export const summarizeRunSettings = ({
  mode,
  clock,
  specs,
  parameters,
  runs,
  maxTime,
}: {
  mode: SimulationMode;
  clock: RunClock;
  specs: SimulatorParameterSpecs;
  parameters: StoredSimulatorParameters;
  runs: number;
  maxTime: number | null;
}): string[] => {
  const details =
    clock === "steps"
      ? ["step by step"]
      : visibleSimulatorParameters(specs, parameters).flatMap(
          ([key, spec]) => parameterDetail(spec, parameters[key]) ?? [],
        );
  if (mode === "stochastic") {
    details.push(`${runs.toLocaleString("en-US")} runs`);
    if (maxTime !== null) {
      const end = formatSettingNumber(runEndOf(clock, maxTime));
      details.push(clock === "steps" ? `to step ${end}` : `to ${end} s`);
    }
  }
  return details;
};

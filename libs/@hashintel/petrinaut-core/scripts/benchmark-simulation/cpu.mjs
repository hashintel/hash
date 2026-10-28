import { DEFAULT_PETRINAUT_EXTENSIONS } from "../../src/extensions";
import { resolveNetParameterValues } from "../../src/parameter-values";
import {
  createMonteCarloUserDefinedMetric,
  createMonteCarloUserDefinedMetricConfigsFromSpecs,
} from "../../src/simulation/monte-carlo/metrics/index";
import { createMonteCarloSimulator } from "../../src/simulation/monte-carlo/monte-carlo-simulator";

export const initialize = () => {};
export const memoryBytes = () => 0;

/** @param {import("../../src/simulation/monte-carlo/worker/messages").MonteCarloInitMessage} config */
export const create = (config) => {
  const parameters = resolveNetParameterValues(
    config.sdcpn.parameters,
    config.parameterValues,
    (config.extensions ?? DEFAULT_PETRINAUT_EXTENSIONS).parameters,
  );
  const userMetrics = createMonteCarloUserDefinedMetricConfigsFromSpecs(
    config.metricSpecs ?? [],
    config.sdcpn,
    parameters,
  ).map(createMonteCarloUserDefinedMetric);
  return {
    simulator: createMonteCarloSimulator({ ...config, metrics: userMetrics }),
    userMetrics,
  };
};

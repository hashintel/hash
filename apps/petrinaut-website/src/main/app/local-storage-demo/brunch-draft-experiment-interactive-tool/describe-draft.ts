import type {
  PetrinautExperimentRequest,
  SDCPN,
} from "@hashintel/petrinaut-core";
import type { prepareExperiment } from "@hashintel/petrinaut/react";

export type PreparedExperiment = ReturnType<typeof prepareExperiment>;

const nameOfScenario = (definition: SDCPN, scenarioId: string) =>
  definition.scenarios?.find((scenario) => scenario.id === scenarioId)?.name ??
  scenarioId;

const nameOfMetric = (definition: SDCPN, metricId: string) =>
  definition.metrics?.find((metric) => metric.id === metricId)?.name ??
  metricId;

const formatNumber = (value: number) => String(value);

/**
 * The one sentence the person reads first: what varies, over what range,
 * under which scenario, and what is minimized or maximized. Names come from
 * the live definition; identifiers are only shown when a name is missing.
 */
export const describeExperiment = (
  prepared: PreparedExperiment,
  definition: SDCPN,
): string => {
  const axes = new Map(
    prepared.parameterAxes.map((axis) => [axis.identifier, axis]),
  );
  const ranges: string[] = [];
  const fixed: string[] = [];
  for (const identifier of Object.keys(
    prepared.input.scenarioParameterValues,
  )) {
    const axis = axes.get(identifier);
    if (axis) {
      ranges.push(
        `${identifier} ${formatNumber(axis.min)}–${formatNumber(axis.max)}`,
      );
    } else if (Object.hasOwn(prepared.fixedValues, identifier)) {
      fixed.push(`${identifier} = ${String(prepared.fixedValues[identifier])}`);
    }
  }
  const { request } = prepared;
  const scenario = nameOfScenario(definition, request.scenarioId);
  const varying =
    ranges.length > 0 ? `Vary ${ranges.join(", ")}` : "Simulate as saved";
  const held = fixed.length > 0 ? ` with ${fixed.join(", ")}` : "";
  const objective =
    request.execution.mode === "optimize"
      ? `; ${request.execution.direction} ${nameOfMetric(definition, request.execution.objectiveMetricId)}`
      : "";
  return `${varying}${held} under ${scenario}${objective}.`;
};

/** The budget line beside the summary, in the request's own units. */
export const describeBudget = (request: PetrinautExperimentRequest): string => {
  const horizon = `horizon ${formatNumber(request.maxTime)}, step ${formatNumber(request.dt)}`;
  if (request.execution.mode === "optimize") {
    return `${request.execution.steps} optimization steps × ${request.execution.runsPerStep} runs, then ${request.runCount} runs at the best parameters, ${horizon}, seed ${request.seed}.`;
  }
  return `${request.runCount} runs, ${horizon}, seed ${request.seed}.`;
};

export type MetricRole = {
  metricId: string;
  name: string;
  role: "objective" | "reported";
};

/**
 * Every metric the request carries, with its honest role. A metric that is
 * not the objective is reported beside the result and never enforced: the
 * request has no constraints.
 */
export const metricRoles = (
  request: PetrinautExperimentRequest,
  definition: SDCPN,
): MetricRole[] =>
  request.metricIds.map((metricId) => ({
    metricId,
    name: nameOfMetric(definition, metricId),
    role:
      request.execution.mode === "optimize" &&
      request.execution.objectiveMetricId === metricId
        ? "objective"
        : "reported",
  }));

/**
 * What Brunch hears back once the browser has prepared the draft. It is one
 * sentence plus the things the model must not misreport.
 */
export const summarizeForAgent = (
  prepared: PreparedExperiment,
  definition: SDCPN,
  unsupportedCount: number,
): string =>
  `Drafted for this session, not run and not saved with the document: ${describeExperiment(prepared, definition)} ${describeBudget(prepared.request)} ${
    unsupportedCount === 0
      ? "No restrictions were stated; none are enforced."
      : `${unsupportedCount} stated ${unsupportedCount === 1 ? "restriction is" : "restrictions are"} not carried into execution.`
  } The person starts it from the card; do not report it as running.`;

/**
 * The material change a second preparation can reveal: the frozen inputs the
 * run would use differ from the ones the card showed. Compared structurally
 * because both come from the same pure function over the same request.
 */
export const preparationDiffers = (
  drafted: PreparedExperiment,
  current: PreparedExperiment,
): boolean =>
  JSON.stringify({
    input: drafted.input,
    fixed: drafted.fixedValues,
    axes: drafted.parameterAxes,
    optimization: drafted.optimization,
  }) !==
  JSON.stringify({
    input: current.input,
    fixed: current.fixedValues,
    axes: current.parameterAxes,
    optimization: current.optimization,
  });

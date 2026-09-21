import type { MatchedParityConfiguration } from "./configuration.ts";
import type { MatchedParityScenario } from "./scenarios.ts";

export type EvaluationArm = "stock" | "brunch";

export interface CapturedToolCall {
  readonly name: string;
  readonly state: string;
  readonly toolCallId?: string;
}

export interface MatchedParityArtifact {
  readonly arm: EvaluationArm;
  readonly configuration: MatchedParityConfiguration;
  readonly diagnostics: unknown;
  readonly document: {
    readonly title: string;
    readonly sdcpn: Record<string, unknown>;
  };
  readonly elapsedMs: number;
  readonly modelStepCount?: number;
  readonly scenario: MatchedParityScenario;
  readonly toolCalls: readonly CapturedToolCall[];
}

const arrayLength = (value: unknown): number =>
  Array.isArray(value) ? value.length : 0;

const stringsIn = (value: unknown): readonly string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (typeof value !== "object" || value === null) return [];
  return Object.values(value).flatMap(stringsIn);
};

const hasExecutableCode = (sdcpn: Record<string, unknown>): boolean =>
  stringsIn(sdcpn).some((value) =>
    /\b(return|function|const|let|if)\b|=>/u.test(value),
  );

const visualizerCount = (sdcpn: Record<string, unknown>): number =>
  (Array.isArray(sdcpn.places) ? sdcpn.places : []).filter(
    (place) =>
      typeof place === "object" &&
      place !== null &&
      typeof (place as Record<string, unknown>).visualizerCode === "string" &&
      ((place as Record<string, unknown>).visualizerCode as string).trim()
        .length > 0,
  ).length;

const hasLayoutResult = (artifact: MatchedParityArtifact): boolean =>
  artifact.toolCalls.some(
    ({ name, state }) =>
      name === "applyAutoLayout" && state === "output-available",
  );

const sdcpnArray = (
  artifact: MatchedParityArtifact,
  key: string,
): readonly unknown[] => {
  const value = artifact.document.sdcpn[key];
  return Array.isArray(value) ? value : [];
};

export const deriveMechanicalSummary = (artifact: MatchedParityArtifact) => {
  const { required } = artifact.scenario;
  const scenarioCount = sdcpnArray(artifact, "scenarios").length;
  const metricCount = sdcpnArray(artifact, "metrics").length;
  const titlePresent =
    artifact.document.title.trim().length > 0 &&
    !/^untitled|new process$/iu.test(artifact.document.title.trim());
  const executableCodePresent = hasExecutableCode(artifact.document.sdcpn);
  const visualizationCount = visualizerCount(artifact.document.sdcpn);
  const layoutObserved = hasLayoutResult(artifact);
  const diagnosticsClean =
    typeof artifact.diagnostics === "object" &&
    artifact.diagnostics !== null &&
    "isValid" in artifact.diagnostics &&
    artifact.diagnostics.isValid === true;
  const checks = {
    diagnostics: diagnosticsClean,
    executableCode: !required.executableCode || executableCodePresent,
    layout: !required.layout || layoutObserved,
    metric: !required.metric || metricCount > 0,
    scenario: !required.scenario || scenarioCount > 0,
    title: !required.title || titlePresent,
    visualization: !required.visualization || visualizationCount > 0,
  };
  const toolCounts = Object.fromEntries(
    [...new Set(artifact.toolCalls.map(({ name }) => name))]
      .sort()
      .map((name) => [
        name,
        artifact.toolCalls.filter((call) => call.name === name).length,
      ]),
  );
  return {
    arm: artifact.arm,
    scenarioId: artifact.scenario.id,
    elapsedMs: artifact.elapsedMs,
    modelStepCount: artifact.modelStepCount,
    toolCallCount: artifact.toolCalls.length,
    toolCounts,
    title: artifact.document.title,
    placeCount: arrayLength(artifact.document.sdcpn.places),
    transitionCount: arrayLength(artifact.document.sdcpn.transitions),
    scenarioCount,
    metricCount,
    visualizationCount,
    diagnosticsClean,
    executableCodePresent,
    layoutObserved,
    checks,
    mechanicallyComplete: Object.values(checks).every(Boolean),
  };
};

export const deriveComparison = (
  stock: MatchedParityArtifact,
  brunch: MatchedParityArtifact,
) => {
  if (stock.scenario.id !== brunch.scenario.id)
    throw new Error("Cannot compare artifacts from different scenarios.");
  if (stock.scenario.prompt !== brunch.scenario.prompt)
    throw new Error(
      "Cannot compare artifacts produced from different prompts.",
    );
  return {
    scenario: {
      id: stock.scenario.id,
      label: stock.scenario.label,
      prompt: stock.scenario.prompt,
    },
    stock: deriveMechanicalSummary(stock),
    brunch: deriveMechanicalSummary(brunch),
  };
};

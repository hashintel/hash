import {
  matchedParityArms,
  type EvaluationArm,
  type MatchedParityConfiguration,
} from "./configuration.ts";

import type { MatchedParityScenario } from "./scenarios.ts";

export interface CapturedToolCall {
  readonly name: string;
  readonly state: string;
  readonly toolCallId?: string;
}

export interface MatchedParityArtifact {
  readonly schemaVersion: 2;
  readonly arm: EvaluationArm;
  readonly mode: EvaluationArm;
  readonly configuration: MatchedParityConfiguration;
  readonly diagnostics: unknown;
  readonly document: {
    readonly title: string;
    readonly sdcpn: Record<string, unknown>;
  };
  readonly elapsedMs: number;
  readonly modelStepCount?: number;
  readonly scenario: MatchedParityScenario;
  readonly spend: {
    /** Provider-reported catalogue cost, not an invoice. Null means unavailable. */
    readonly observedUsd: number | null;
  };
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
    mode: artifact.mode,
    scenarioId: artifact.scenario.id,
    elapsedMs: artifact.elapsedMs,
    modelStepCount: artifact.modelStepCount,
    observedSpendUsd: artifact.spend.observedUsd,
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

type MechanicalSummary = ReturnType<typeof deriveMechanicalSummary>;

const delta = (from: MechanicalSummary, to: MechanicalSummary) => ({
  elapsedMs: to.elapsedMs - from.elapsedMs,
  metricCount: to.metricCount - from.metricCount,
  modelStepCount:
    from.modelStepCount === undefined || to.modelStepCount === undefined
      ? null
      : to.modelStepCount - from.modelStepCount,
  placeCount: to.placeCount - from.placeCount,
  toolCallCount: to.toolCallCount - from.toolCallCount,
  transitionCount: to.transitionCount - from.transitionCount,
  observedSpendUsd:
    from.observedSpendUsd === null || to.observedSpendUsd === null
      ? null
      : to.observedSpendUsd - from.observedSpendUsd,
});

export const deriveComparison = (
  artifacts: Readonly<Record<EvaluationArm, MatchedParityArtifact>>,
) => {
  const reference = artifacts.S;
  for (const arm of matchedParityArms) {
    const candidate = artifacts[arm];
    if (candidate.scenario.id !== reference.scenario.id)
      throw new Error("Cannot compare artifacts from different scenarios.");
    if (candidate.scenario.prompt !== reference.scenario.prompt)
      throw new Error(
        "Cannot compare artifacts produced from different prompts.",
      );
  }
  const summaries = Object.fromEntries(
    matchedParityArms.map((arm) => [
      arm,
      deriveMechanicalSummary(artifacts[arm]),
    ]),
  ) as Record<EvaluationArm, MechanicalSummary>;
  return {
    scenario: {
      id: reference.scenario.id,
      label: reference.scenario.label,
      prompt: reference.scenario.prompt,
    },
    arms: summaries,
    effects: {
      stockToFlueTransportDrag: {
        from: "S",
        to: "F",
        delta: delta(summaries.S, summaries.F),
      },
      flueToIntegratedArchitectureDrag: {
        from: "F",
        to: "I",
        delta: delta(summaries.F, summaries.I),
      },
      declaredVsDeepConstruction: {
        from: "A",
        to: "B",
        delta: delta(summaries.A, summaries.B),
      },
    },
  };
};

import { createContext } from "react";

import type {
  MonteCarloMetricSpec,
  MonteCarloUserDefinedMetricFrame,
  MonteCarloWorkerProgress,
} from "@hashintel/petrinaut-core";

export type ExperimentStatus =
  | "initializing"
  | "running"
  | "complete"
  | "error"
  | "cancelled";

export type CreateExperimentInput = {
  name: string;
  scenarioId: string | null;
  scenarioParameterValues: Record<string, string>;
  runCount: number;
  seed: number;
  dt: number;
  maxTime: number;
  metricSpecs: readonly MonteCarloMetricSpec[];
};

export type ExperimentRecord = {
  id: string;
  name: string;
  createdAt: number;
  scenarioId: string | null;
  scenarioName: string | null;
  runCount: number;
  seed: number;
  dt: number;
  maxTime: number;
  status: ExperimentStatus;
  error: string | null;
  metricSpecs: readonly MonteCarloMetricSpec[];
  progress: MonteCarloWorkerProgress | null;
  metricFrames: readonly MonteCarloUserDefinedMetricFrame[];
  latestMetricFramesById: Readonly<
    Record<string, MonteCarloUserDefinedMetricFrame>
  >;
};

export function isExperimentActive(experiment: ExperimentRecord): boolean {
  return (
    experiment.status === "initializing" || experiment.status === "running"
  );
}

export type ExperimentsContextValue = {
  experiments: readonly ExperimentRecord[];
  selectedExperimentId: string | null;
  selectedExperiment: ExperimentRecord | null;
  setSelectedExperimentId: (experimentId: string | null) => void;
  createExperiment: (input: CreateExperimentInput) => Promise<string>;
  cancelExperiment: (experimentId: string) => void;
  removeExperiment: (experimentId: string) => void;
};

const DEFAULT_CONTEXT_VALUE: ExperimentsContextValue = {
  experiments: [],
  selectedExperimentId: null,
  selectedExperiment: null,
  setSelectedExperimentId: () => {},
  createExperiment: () => Promise.resolve(""),
  cancelExperiment: () => {},
  removeExperiment: () => {},
};

export const ExperimentsContext = createContext<ExperimentsContextValue>(
  DEFAULT_CONTEXT_VALUE,
);

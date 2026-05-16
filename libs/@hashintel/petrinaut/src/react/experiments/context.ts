import { createContext } from "react";

import type {
  MonteCarloWorkerProgress,
  PlaceTokenCountDistributionFrame,
} from "../../core/simulation";

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
  progress: MonteCarloWorkerProgress | null;
  distributionFrames: readonly PlaceTokenCountDistributionFrame[];
};

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

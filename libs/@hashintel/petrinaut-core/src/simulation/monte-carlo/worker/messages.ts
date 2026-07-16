import type { PetrinautExtensionSettings } from "../../../extensions";
import type { HirArtifacts } from "../../../hir-runtime";
import type { SDCPN } from "../../../types/sdcpn";
import type { InitialMarking } from "../../api";
import type {
  MonteCarloMetricSpec,
  MonteCarloUserDefinedMetricFrame,
} from "../metrics";
import type { MonteCarloAdvanceResult } from "../types";

export type MonteCarloInitMessage = {
  type: "init";
  sdcpn: SDCPN;
  extensions?: PetrinautExtensionSettings;
  initialMarking: InitialMarking;
  parameterValues: Record<string, string>;
  seed: number;
  dt: number;
  maxTime: number;
  /** Precompiled HIR artifacts (`compileHirArtifacts`) — required for any
   * dynamics/lambda/kernel user code in the net. */
  hirArtifacts?: HirArtifacts;
  runCount: number;
  batchSize?: number;
  metricSpecs?: readonly MonteCarloMetricSpec[];
};

export type MonteCarloStartMessage = {
  type: "start";
};

export type MonteCarloCancelMessage = {
  type: "cancel";
};

export type MonteCarloToWorkerMessage =
  | MonteCarloInitMessage
  | MonteCarloStartMessage
  | MonteCarloCancelMessage;

export type MonteCarloProgressMessage = {
  type: "progress";
  progress: MonteCarloWorkerProgress;
};

export type MonteCarloMetricFramesMessage = {
  type: "metricFrames";
  frames: MonteCarloUserDefinedMetricFrame[];
};

export type MonteCarloReadyMessage = {
  type: "ready";
};

export type MonteCarloCompleteMessage = {
  type: "complete";
  progress: MonteCarloWorkerProgress;
};

export type MonteCarloCancelledMessage = {
  type: "cancelled";
  progress: MonteCarloWorkerProgress | null;
};

export type MonteCarloErrorMessage = {
  type: "error";
  message: string;
  itemId: string | null;
};

export type MonteCarloWorkerProgress = MonteCarloAdvanceResult & {
  frameNumber: number;
  time: number;
  runCount: number;
};

export type MonteCarloToMainMessage =
  | MonteCarloReadyMessage
  | MonteCarloProgressMessage
  | MonteCarloMetricFramesMessage
  | MonteCarloCompleteMessage
  | MonteCarloCancelledMessage
  | MonteCarloErrorMessage;

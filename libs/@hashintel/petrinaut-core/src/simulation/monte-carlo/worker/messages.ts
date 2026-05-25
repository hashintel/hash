import type { SDCPN } from "../../../types/sdcpn";
import type { InitialMarking } from "../../api";
import type {
  MonteCarloMetricSpec,
  MonteCarloUserDefinedMetricFrame,
  PlaceTokenCountDistributionFrame,
} from "../metrics";
import type { MonteCarloAdvanceResult } from "../types";

export type MonteCarloInitMessage = {
  type: "init";
  sdcpn: SDCPN;
  initialMarking: InitialMarking;
  parameterValues: Record<string, string>;
  seed: number;
  dt: number;
  maxTime: number;
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

export type MonteCarloDistributionFramesMessage = {
  type: "distributionFrames";
  frames: PlaceTokenCountDistributionFrame[];
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
  | MonteCarloDistributionFramesMessage
  | MonteCarloMetricFramesMessage
  | MonteCarloCompleteMessage
  | MonteCarloCancelledMessage
  | MonteCarloErrorMessage;

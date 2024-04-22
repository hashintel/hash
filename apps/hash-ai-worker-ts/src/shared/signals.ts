import type { StepProgressLog } from "@local/hash-isomorphic-utils/flows/types";
import { defineSignal } from "@temporalio/workflow";

export type ProgressLogSignalData = {
  attempt: number;
  logs: StepProgressLog[];
};

export const logProgressSignal =
  defineSignal<[ProgressLogSignalData]>("logProgress");

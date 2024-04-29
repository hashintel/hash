import type { ProgressLogSignalData } from "@local/hash-isomorphic-utils/flows/types";
import { defineSignal } from "@temporalio/workflow";

export const logProgressSignal =
  defineSignal<[ProgressLogSignalData]>("logProgress");

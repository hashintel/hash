import type { ExternalInputResponseSignal } from "@local/hash-isomorphic-utils/flows/types";
import { defineSignal } from "@temporalio/workflow";

export const externalInputResponseSignal = defineSignal<
  [ExternalInputResponseSignal]
>("externalInputResponse");

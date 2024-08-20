import { defineSignal } from "@temporalio/workflow";

import type { ExternalInputResponseSignal, FlowSignalType } from "./types.js";

export const externalInputResponseSignal = defineSignal<
  [ExternalInputResponseSignal]
>("externalInputResponse" satisfies FlowSignalType);

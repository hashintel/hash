import { defineSignal } from "@temporalio/workflow";

import type { ExternalInputResponseSignal } from "./types.js";

export const externalInputResponseSignal = defineSignal<
  [ExternalInputResponseSignal]
>("externalInputResponse");

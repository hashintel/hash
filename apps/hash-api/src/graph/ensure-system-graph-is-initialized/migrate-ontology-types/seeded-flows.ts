import {
  automaticBrowserInferenceFlow,
  manualBrowserInferenceFlow,
} from "@local/hash-isomorphic-utils/flows/browser-plugin-flow-definitions";
import { inferMetadataFromDocumentFlow } from "@local/hash-isomorphic-utils/flows/file-flow-definitions";
import {
  configureDashboardItemFlow,
  refineDashboardItemFlow,
} from "@local/hash-isomorphic-utils/flows/frontend-flow-definitions";
import { goalFlow } from "@local/hash-isomorphic-utils/flows/goal-flow-definitions";
import {
  historicalFlightsFlow,
  scheduledFlightsFlow,
} from "@local/hash-isomorphic-utils/flows/integration-flow-definitions";

import type { FlowDefinitionWithId } from "@local/hash-isomorphic-utils/flows/types";

/**
 * The flows defined in code that migrations seed as `Flow Definition` entities. A dev-only flow is seeded by dev
 * migrations, because it uses types that only exist in development.
 *
 * Only tooling uses this list: migrations seed from snapshots (see `flow-definition-snapshots.ts`).
 */
export const seededFlows: { flow: FlowDefinitionWithId; devOnly: boolean }[] = [
  { flow: goalFlow, devOnly: false },
  { flow: manualBrowserInferenceFlow, devOnly: false },
  { flow: automaticBrowserInferenceFlow, devOnly: false },
  { flow: inferMetadataFromDocumentFlow, devOnly: false },
  { flow: configureDashboardItemFlow, devOnly: false },
  { flow: refineDashboardItemFlow, devOnly: false },
  { flow: historicalFlightsFlow, devOnly: true },
  { flow: scheduledFlightsFlow, devOnly: true },
];

/**
 * A flow definition as a snapshot holds it: JSON has no `undefined` values, so they are dropped, as they would be
 * when a snapshot is written and read back.
 */
export const toSnapshotForm = (
  flowDefinition: FlowDefinitionWithId["flowDefinition"],
): FlowDefinitionWithId["flowDefinition"] =>
  JSON.parse(
    JSON.stringify(flowDefinition),
  ) as FlowDefinitionWithId["flowDefinition"];

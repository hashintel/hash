import {
  automaticBrowserInferenceFlow,
  manualBrowserInferenceFlow,
} from "@local/hash-isomorphic-utils/flows/definitions/browser-plugin-flow-definitions";
import { inferMetadataFromDocumentFlow } from "@local/hash-isomorphic-utils/flows/definitions/file-flow-definitions";
import {
  configureDashboardItemFlow,
  refineDashboardItemFlow,
} from "@local/hash-isomorphic-utils/flows/definitions/frontend-flow-definitions";
import { goalFlow } from "@local/hash-isomorphic-utils/flows/definitions/goal-flow-definitions";

import type { FlowDefinitionWithId } from "@local/hash-isomorphic-utils/flows/types";

/**
 * The flows HASH provides, which migrations seed as `Flow Definition` entities.
 *
 * Only tooling uses this list: migrations seed from snapshots (see `flow-definition-snapshots.ts`).
 * Flows that only exist in development are in `dev-flows.ts`.
 */
export const seededFlows: FlowDefinitionWithId[] = [
  goalFlow,
  manualBrowserInferenceFlow,
  automaticBrowserInferenceFlow,
  inferMetadataFromDocumentFlow,
  configureDashboardItemFlow,
  refineDashboardItemFlow,
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

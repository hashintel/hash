import {
  flowDefinitionIds,
  generateHashFlowDefinitionEntityId,
} from "@local/hash-isomorphic-utils/flows/flow-definition-ids";

import type { EntityId, WebId } from "@blockprotocol/type-system";

/**
 * The entity id of the flow definition the plugin starts for an inference request of a given trigger.
 */
export const generateBrowserInferenceFlowDefinitionEntityId = ({
  hashWebId,
  trigger,
}: {
  hashWebId: WebId;
  trigger: "automatic" | "manual";
}): EntityId =>
  generateHashFlowDefinitionEntityId(
    hashWebId,
    trigger === "automatic"
      ? flowDefinitionIds.automaticBrowserInference
      : flowDefinitionIds.manualBrowserInference,
  );

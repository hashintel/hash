import type { EntityUuid } from "@blockprotocol/type-system";

import type {
  InputNameForAiFlowAction,
  OutputNameForAiFlowAction,
} from "./action-definitions.js";
import type { FlowDefinition } from "./types.js";

/**
 * @example
 * mutation {
 *   startFlow(
 *     dataSources: {
 *       files: { fileEntityIds: [] }
 *       internetAccess: {
 *         enabled: false
 *         browserPlugin: { enabled: false, domains: [] }
 *       }
 *     }
 *     webId:"558b0742-3990-4bcc-a486-db231e278894"
 *     flowTrigger: {
 *       triggerDefinitionId: "onFileUpload"
 *       outputs: [
 *         {
 *           outputName: "fileEntityId"
 *           payload: {
 *             kind: "EntityId"
 *             value: "558b0742-3990-4bcc-a486-db231e278894~612a3806-930c-49f6-882f-5ee88a56eaf3"
 *           }
 *         }
 *       ]
 *     }
 *     flowDefinition: {
 *       name: "Infer metadata from document"
 *       flowDefinitionId: "infer-metadata-from-document"
 *       description: "Infer metadata from a document, assign appropriate type to document, and create associated entities."
 *       trigger: {
 *         kind: "trigger"
 *         description: "Triggered when user visits a web page"
 *         triggerDefinitionId: "onFileUpload"
 *         outputs: [
 *           {
 *             payloadKind: "EntityId"
 *             name: "fileEntityId"
 *             array: false
 *             required: true
 *           }
 *         ]
 *       }
 *       steps: [
 *         {
 *           stepId: "1"
 *           kind: "action"
 *           actionDefinitionId: "inferMetadataFromDocument"
 *           description: "Infer metadata from document, assign appropriate type, propose associated entities"
 *           inputSources: [
 *             {
 *               inputName: "documentEntityId"
 *               kind: "step-output"
 *               sourceStepId: "trigger"
 *               sourceStepOutputName: "fileEntityId"
 *             }
 *           ]
 *         }
 *         {
 *           stepId: "2"
 *           kind: "action"
 *           actionDefinitionId: "persistEntities"
 *           description: "Save proposed entities to database"
 *           inputSources: [
 *             {
 *               inputName: "proposedEntities"
 *               kind: "step-output"
 *               sourceStepId: "1"
 *               sourceStepOutputName: "proposedEntities"
 *             }
 *           ]
 *         }
 *       ]
 *       outputs: [
 *         {
 *           stepId: "2"
 *           stepOutputName: "persistedEntities"
 *           name: "persistedEntities"
 *           payloadKind: "PersistedEntity"
 *           array: true
 *           required: true
 *         }
 *       ]
 *     }
 *   )
 * }
 */
export const inferMetadataFromDocumentFlowDefinition: FlowDefinition = {
  name: "Infer metadata from document",
  flowDefinitionId: "infer-metadata-from-document" as EntityUuid,
  description:
    "Infer metadata from a document, assign appropriate type to document, and create associated entities.",
  trigger: {
    kind: "trigger",
    description: "Triggered when user visits a web page",
    triggerDefinitionId: "onFileUpload",
    outputs: [
      {
        payloadKind: "EntityId",
        name: "fileEntityId",
        array: false,
        required: true,
      },
    ],
  },
  steps: [
    {
      stepId: "1",
      kind: "action",
      actionDefinitionId: "inferMetadataFromDocument",
      description:
        "Infer metadata from document, assign appropriate type, propose associated entities",
      inputSources: [
        {
          inputName:
            "documentEntityId" satisfies InputNameForAiFlowAction<"inferMetadataFromDocument">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName: "fileEntityId",
        },
      ],
    },
    {
      stepId: "2",
      kind: "action",
      actionDefinitionId: "persistEntities",
      description: "Save proposed entities to database",
      inputSources: [
        {
          inputName:
            "proposedEntities" satisfies InputNameForAiFlowAction<"persistEntities">,
          kind: "step-output",
          sourceStepId: "1",
          sourceStepOutputName:
            "proposedEntities" satisfies OutputNameForAiFlowAction<"inferMetadataFromDocument">,
        },
      ],
    },
  ],
  outputs: [
    {
      stepId: "2",
      stepOutputName: "persistedEntities",
      name: "persistedEntities" as const,
      payloadKind: "PersistedEntity",
      array: true,
      required: true,
    },
  ],
};

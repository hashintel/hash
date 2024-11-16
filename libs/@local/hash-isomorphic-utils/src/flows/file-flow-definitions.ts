import type { FlowDefinition } from "@local/hash-isomorphic-utils/flows/types";
import type { EntityUuid } from "@local/hash-graph-types/entity";
import type {
  InputNameForAction,
  OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";

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
            "documentEntityId" satisfies InputNameForAction<"inferMetadataFromDocument">,
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
            "proposedEntities" satisfies InputNameForAction<"persistEntities">,
          kind: "step-output",
          sourceStepId: "1",
          sourceStepOutputName:
            "proposedEntities" satisfies OutputNameForAction<"inferMetadataFromDocument">,
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

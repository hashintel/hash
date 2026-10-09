import { typedActionDefinitions as actions } from "./action-definitions.js";
import { defineFlow, flowInput } from "./define-flow.js";

/**
 * Started when a file is uploaded (see `graphql/resolvers/knowledge/file/shared.ts` in `hash-api`), with the
 * uploaded file's entity id as its `fileEntityId` input.
 */
export const inferMetadataFromDocumentFlow = defineFlow(
  {
    /* infer-metadata-from-document */
    flowDefinitionId: "936f6a29-a964-533b-ae1a-03bed7da6471",
    name: "Infer metadata from document",
    description:
      "Infer metadata from a document, assign appropriate type to document, and create associated entities.",
    inputs: {
      fileEntityId: flowInput("EntityId"),
    },
  },
  ({ inputs, step }) => {
    const inferMetadata = step("1", actions.inferMetadataFromDocument, {
      description:
        "Infer metadata from document, assign appropriate type, propose associated entities",
      inputs: { documentEntityId: inputs.fileEntityId },
    });

    const persist = step("2", actions.persistEntities, {
      description: "Save proposed entities to database",
      inputs: { proposedEntities: inferMetadata.outputs.proposedEntities },
    });

    return {
      outputs: { persistedEntities: persist.outputs.persistedEntities },
    };
  },
);

import { typedActionDefinitions as actions } from "./action-definitions.js";
import { defineFlow, flowInput } from "./define-flow.js";

const persistedEntitiesOutputDescription =
  "The entities created or updated by the flow run";

/**
 * The plugin starts this flow with the inputs typed as `ManualInferenceInputs`.
 */
export const manualBrowserInferenceFlow = defineFlow(
  {
    /* manual-browser-inference */
    flowDefinitionId: "a7bc5e44-f1ce-5126-b5db-8eb4cf054116",
    name: "Analyze webpage",
    description: "Find entities of the requested types in a web page",
    inputs: {
      visitedWebPage: flowInput("WebPage", {
        description: "The web page visited",
      }),
      entityTypeIds: flowInput("VersionedUrl", {
        array: true,
        description: "The ids of the entity types to create entities of",
      }),
      model: flowInput("Text", {
        description: "The model to use for inference",
      }),
      draft: flowInput("Boolean", {
        description: "Whether the entities should be created as drafts or not",
      }),
    },
  },
  ({ inputs, step }) => {
    const inferEntities = step("0", actions.inferEntitiesFromContent, {
      description: "Find entities in web page content",
      inputs: {
        content: inputs.visitedWebPage,
        entityTypeIds: inputs.entityTypeIds,
        model: inputs.model,
      },
    });

    const persist = step("1", actions.persistEntities, {
      description: "Save proposed entities to database",
      inputs: {
        proposedEntities: inferEntities.outputs.proposedEntities,
        draft: inputs.draft,
      },
    });

    return {
      outputs: {
        persistedEntities: {
          ref: persist.outputs.persistedEntities,
          description: persistedEntitiesOutputDescription,
        },
      },
    };
  },
);

/**
 * The plugin starts this flow with the inputs typed as `AutomaticInferenceInputs`.
 */
export const automaticBrowserInferenceFlow = defineFlow(
  {
    /* automatic-browser-inference */
    flowDefinitionId: "a4385fa8-a457-584e-b81e-f7e49f3d0b3c",
    name: "Auto-analyze webpage",
    description:
      "Find entities in a web page according to the user's passive analysis settings",
    inputs: {
      visitedWebPage: flowInput("WebPage", {
        description: "The web page visited",
      }),
    },
  },
  ({ inputs, step }) => {
    const settings = step("0", actions.processAutomaticBrowsingSettings, {
      description:
        "Decide which types of entity to find given the web page visited",
      inputs: { webPage: inputs.visitedWebPage },
    });

    const inferEntities = step("1", actions.inferEntitiesFromContent, {
      description: "Infer entities from web page content",
      inputs: {
        content: inputs.visitedWebPage,
        model: settings.outputs.model,
        entityTypeIds: settings.outputs.entityTypeIds,
      },
    });

    const persist = step("2", actions.persistEntities, {
      description: "Save proposed entities to database",
      inputs: {
        proposedEntities: inferEntities.outputs.proposedEntities,
        draft: settings.outputs.draft,
      },
    });

    return {
      outputs: {
        persistedEntities: {
          ref: persist.outputs.persistedEntities,
          description: persistedEntitiesOutputDescription,
        },
      },
    };
  },
);

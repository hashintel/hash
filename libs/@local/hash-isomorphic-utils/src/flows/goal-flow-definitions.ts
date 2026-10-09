import { typedActionDefinitions as actions } from "./action-definitions.js";
import { constant, defineFlow, flowInput } from "./define-flow.js";

const goalFlowInputs = {
  researchGuidance: flowInput("Text", { label: "Research guidance" }),
  entityTypes: flowInput("VersionedUrl", {
    array: true,
    label: "Entity Types",
  }),
  draft: flowInput("Boolean", { label: "Create as draft" }),
  reportSpecification: flowInput("Text", {
    label: "Report specification",
    required: false,
    description:
      "What the report should cover. Without one, the flow writes no report.",
  }),
  googleAccount: flowInput("GoogleAccountId", {
    label: "Google Account",
    required: false,
  }),
  googleSheet: flowInput("GoogleSheet", {
    label: "Google Sheet",
    required: false,
    description:
      "The spreadsheet to write the discovered entities to. Without one (or a Google account), the flow writes no spreadsheet.",
  }),
};

/** The names of the goal flow's inputs. */
export type GoalFlowInputName = keyof typeof goalFlowInputs;

/**
 * Researches entities according to a goal and persists them, optionally writing a report and a Google Sheet:
 * each deliverable is skipped when the inputs it needs aren't provided.
 */
export const goalFlow = defineFlow(
  {
    /* research-goal */
    flowDefinitionId: "ea4ac27d-7fe2-5400-ac72-ab4b41de9f67",
    name: "Research goal",
    description:
      "Discover entities according to a research brief and save them to HASH, optionally writing a report and saving the entities to a Google Sheet",
    inputs: goalFlowInputs,
  },
  ({ inputs, step }) => {
    const research = step("1", actions.researchEntities, {
      description:
        "Discover entities according to research specification, using public web sources",
      inputs: {
        prompt: inputs.researchGuidance,
        entityTypeIds: inputs.entityTypes,
        reportSpecification: inputs.reportSpecification,
      },
    });

    const persist = step("2", actions.persistEntities, {
      description: "Save discovered entities and relationships to HASH graph",
      inputs: {
        proposedEntities: research.outputs.proposedEntities,
        draft: inputs.draft,
      },
    });

    const report = step("3", actions.answerQuestion, {
      description: "Write report based on the research specification",
      inputs: {
        question: inputs.reportSpecification.orSkip(),
        entities: persist.outputs.persistedEntities,
      },
    });

    const sheet = step("4", actions.writeGoogleSheet, {
      description: "Save discovered entities to Google Sheet",
      inputs: {
        audience: constant("ActorType", "user"),
        googleAccountId: inputs.googleAccount.orSkip(),
        googleSheet: inputs.googleSheet.orSkip(),
        persistedEntities: persist.outputs.persistedEntities,
      },
    });

    return {
      outputs: {
        report: report.outputs.answer,
        googleSheetEntity: sheet.outputs.googleSheetEntity,
      },
    };
  },
);

/**
 * Whether a run or definition is of the goal flow.
 */
export const isGoalFlowDefinitionId = (flowDefinitionId: string) =>
  flowDefinitionId === goalFlow.flowDefinitionId;

import type { DistributiveOmit } from "@local/advanced-types/distribute";
import type {
  InputNameForAction,
  OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  ActionStepDefinition,
  FlowDefinition,
} from "@local/hash-isomorphic-utils/flows/types";

export type ReportTriggerInput = "Report specification";

export const markdownReportTriggerInputs = [
  {
    payloadKind: "Text",
    name: "Report specification" satisfies ReportTriggerInput,
    array: false,
    required: true,
  },
] satisfies FlowDefinition["trigger"]["outputs"];

export const markdownReportResearchEntitiesStepInput = {
  inputName:
    "reportSpecification" satisfies InputNameForAction<"researchEntities">,
  kind: "step-output",
  sourceStepId: "trigger",
  sourceStepOutputName: "Report specification" satisfies ReportTriggerInput,
} as const satisfies ActionStepDefinition["inputSources"][number];

export const markdownReportStep = {
  kind: "action",
  actionDefinitionId: "answerQuestion",
  description: "Write report based on the research specification",
  inputSources: [
    {
      inputName: "question" satisfies InputNameForAction<"answerQuestion">,
      kind: "step-output",
      sourceStepId: "trigger",
      sourceStepOutputName: "Report specification",
    },
    {
      inputName: "entities" satisfies InputNameForAction<"answerQuestion">,
      kind: "step-output",
      sourceStepId: "2",
      sourceStepOutputName:
        "persistedEntities" satisfies OutputNameForAction<"persistEntities">,
    },
  ],
} satisfies DistributiveOmit<
  FlowDefinition["steps"][number],
  "stepId" | "groupId"
>;

export const markdownReportDeliverable = {
  stepOutputName: "answer" satisfies OutputNameForAction<"answerQuestion">,
  payloadKind: "Text",
  name: "report" as const,
  array: false,
  required: true,
} satisfies Omit<FlowDefinition["outputs"][number], "stepId">;

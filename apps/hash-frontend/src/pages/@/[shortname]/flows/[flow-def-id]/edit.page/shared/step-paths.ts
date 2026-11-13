import type {
  FlowActionDefinitionId,
  StepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";

/** A way a step can go on: the steps whose `runAfter` names the step and `outputName` follow it. */
export type StepPath = {
  outputName: string;
  name: string;
  /** Whether the name can be changed; a catch-all path, such as If's No, keeps its name. */
  renamable: boolean;
  /** When the step takes the path. */
  help: string;
};

/** By action, in card order. */
const actionPaths: Partial<Record<string, StepPath[]>> = {
  if: [
    {
      outputName: "true",
      name: "Yes",
      renamable: true,
      help: "When the condition matches",
    },
    {
      outputName: "false",
      name: "No",
      renamable: false,
      help: "When the condition doesn't match",
    },
  ],
} satisfies Partial<Record<FlowActionDefinitionId, StepPath[]>>;

/** A step's paths, with the names given to them; none for a step that doesn't branch. */
export const getStepPaths = (step: StepDefinition<string>): StepPath[] =>
  step.kind === "action"
    ? (actionPaths[step.actionDefinitionId]?.map((path) => ({
        ...path,
        name:
          (path.renamable ? step.pathNames?.[path.outputName] : undefined) ??
          path.name,
      })) ?? [])
    : [];

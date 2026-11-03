import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/action-definitions";

import type { IconName } from "@hashintel/ds-components";
import type {
  FlowActionDefinitionId,
  StepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";

/**
 * What the editor calls a step, in labels. Whether canvas cards are "steps" or "nodes" is still open, so labels
 * build on this.
 */
export const stepNoun = { singular: "step", plural: "steps" } as const;

export const countSteps = (count: number) =>
  `${count} ${count === 1 ? stepNoun.singular : stepNoun.plural}`;

/** The colour of a step's icon tile. */
export type StepTone = "blue" | "green" | "orange" | "neutral";

/**
 * The actions the "+" list offers, until the Add picker replaces it. `if` waits on the design for branching.
 */
export const addableActions: {
  actionDefinitionId: FlowActionDefinitionId;
  label: string;
  icon: IconName;
  tone: StepTone;
}[] = [
  {
    actionDefinitionId: "queryEntities",
    label: "Find entities",
    icon: "search",
    tone: "green",
  },
  {
    actionDefinitionId: "filterList",
    label: "Filter list",
    icon: "filter",
    tone: "green",
  },
  {
    actionDefinitionId: "createEntity",
    label: "Create entity",
    icon: "squarePlus",
    tone: "green",
  },
  {
    actionDefinitionId: "updateEntity",
    label: "Update entity",
    icon: "edit",
    tone: "green",
  },
  {
    actionDefinitionId: "draftMessage",
    label: "Draft message",
    icon: "feather",
    tone: "orange",
  },
];

/** How Start, which holds the flow's inputs, is shown. */
export const startDisplay = {
  title: "Start",
  description: "Flow inputs",
  icon: "play",
  tone: "blue",
} as const satisfies {
  title: string;
  description: string;
  icon: IconName;
  tone: StepTone;
};

/**
 * How a step is shown: its kind (the action's name, or "For each") with an icon, and the description its author gave
 * it, if any.
 */
export const getStepDisplay = (
  step: StepDefinition<string>,
): { title: string; description: string; icon: IconName; tone: StepTone } => {
  if (step.kind === "for-each") {
    return {
      title: "For each",
      description: step.description,
      icon: "refresh",
      tone: "neutral",
    };
  }

  const addable = addableActions.find(
    ({ actionDefinitionId }) => actionDefinitionId === step.actionDefinitionId,
  );

  /* A definition may name an action that doesn't exist. */
  const definition = (
    actionDefinitions as Partial<Record<string, { name: string }>>
  )[step.actionDefinitionId];

  return {
    title: addable?.label ?? definition?.name ?? step.actionDefinitionId,
    description: step.description,
    icon: addable?.icon ?? "lightning",
    tone: addable?.tone ?? "neutral",
  };
};

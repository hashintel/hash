import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/action-definitions";

import type { IconName, MenuItem } from "@hashintel/ds-components";
import type {
  FlowActionDefinitionId,
  StepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";

export const stepNoun = { singular: "step", plural: "steps" } as const;

export const countSteps = (count: number) =>
  `${count} ${count === 1 ? stepNoun.singular : stepNoun.plural}`;

export type StepTone = "green" | "orange" | "neutral";

// TODO(FE-2125): offer every action, from their action definitions
const addableActions: {
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

export const getAddStepMenuItems = (
  onPick: (actionDefinitionId: string) => void,
): MenuItem[] =>
  addableActions.map(({ actionDefinitionId, label, icon }) => ({
    id: actionDefinitionId,
    text: label,
    icon,
    onClick: () => onPick(actionDefinitionId),
  }));

export const startDisplay = {
  title: "Start",
  description: "Flow inputs",
  icon: "play",
  tone: "neutral",
} as const satisfies {
  title: string;
  description: string;
  icon: IconName;
  tone: StepTone;
};

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

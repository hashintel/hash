import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/action-definitions";

import type { IconName } from "@hashintel/ds-components";
import type {
  FlowActionDefinitionId,
  StepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";

export const stepNoun = { singular: "step", plural: "steps" } as const;

export const countSteps = (count: number) =>
  `${count} ${count === 1 ? stepNoun.singular : stepNoun.plural}`;

export type StepTone = "green" | "orange" | "neutral";

type ActionGroupId =
  | "people"
  | "messages"
  | "documents"
  | "entities"
  | "flowControl";

const actionGroups: {
  groupId: ActionGroupId;
  label: string;
  icon: IconName;
}[] = [
  { groupId: "people", label: "People", icon: "user" },
  { groupId: "messages", label: "Messages", icon: "at" },
  { groupId: "documents", label: "Documents", icon: "download" },
  { groupId: "entities", label: "Entities", icon: "cube" },
  { groupId: "flowControl", label: "Flow control", icon: "rotate" },
];

export type AddableAction = {
  actionDefinitionId: FlowActionDefinitionId;
  /** What people call the action, which can differ from its definition's name. */
  label: string;
  description: string;
  groupId: ActionGroupId;
  icon: IconName;
  tone: StepTone;
};

/**
 * In the order each group lists them. Only actions with a definition can be offered: Ask a person (FE-1987), Send
 * email (FE-1832), For each (FE-1915) and Wait (FE-2012) join once they have one.
 */
const addableActions: AddableAction[] = [
  {
    actionDefinitionId: "draftMessage",
    label: "Draft email",
    description: "Write an email's subject and body",
    groupId: "messages",
    icon: "feather",
    tone: "orange",
  },
  {
    actionDefinitionId: "getFileFromUrl",
    label: "Fetch file",
    description: "Download a file from a URL into HASH",
    groupId: "documents",
    icon: "download",
    tone: "neutral",
  },
  {
    actionDefinitionId: "queryEntities",
    label: "Find entities",
    description: "Search one or more entity types, with conditions",
    groupId: "entities",
    icon: "search",
    tone: "green",
  },
  {
    actionDefinitionId: "createEntity",
    label: "Create entity",
    description: "Add a new entity to the graph",
    groupId: "entities",
    icon: "squarePlus",
    tone: "green",
  },
  {
    actionDefinitionId: "updateEntity",
    label: "Update entity",
    description: "Change properties on an existing entity",
    groupId: "entities",
    icon: "edit",
    tone: "green",
  },
  {
    actionDefinitionId: "if",
    label: "If",
    description: "Send a value to Yes or No by a condition",
    groupId: "flowControl",
    icon: "diagramNodes",
    tone: "neutral",
  },
  {
    actionDefinitionId: "filterList",
    label: "Filter list",
    description: "Split a list into matching and other items",
    groupId: "flowControl",
    icon: "filter",
    tone: "green",
  },
  {
    actionDefinitionId: "find",
    label: "Find",
    description: "Pick the first item of a list that matches a condition",
    groupId: "flowControl",
    icon: "bullseye",
    tone: "green",
  },
  {
    actionDefinitionId: "orderBy",
    label: "Order by",
    description: "Sort a list by its items, one of their fields or a property",
    groupId: "flowControl",
    icon: "sortDown",
    tone: "green",
  },
  {
    actionDefinitionId: "takeFirst",
    label: "Take first",
    description: "Keep the first items of a list, up to a count",
    groupId: "flowControl",
    icon: "circleOne",
    tone: "green",
  },
  {
    actionDefinitionId: "aggregate",
    label: "Aggregate",
    description:
      "Count a list's items, or take their sum, average, minimum or maximum",
    groupId: "flowControl",
    icon: "function",
    tone: "green",
  },
];

/** `undefined` for an action that can't be added. */
export const findAddableAction = (actionDefinitionId: string) =>
  addableActions.find(
    (action) => action.actionDefinitionId === actionDefinitionId,
  );

/** Offered on an empty flow: actions that can start one, needing only the flow's inputs. */
export const recommendedActions = (
  [
    "queryEntities",
    "getFileFromUrl",
    "createEntity",
  ] satisfies FlowActionDefinitionId[]
).flatMap((actionDefinitionId) => findAddableAction(actionDefinitionId) ?? []);

export type ActionGroup = (typeof actionGroups)[number] & {
  actions: AddableAction[];
};

/** The groups of actions in the Add tab and the add menu, leaving out any with nothing that can be added yet. */
export const addableActionGroups: ActionGroup[] = actionGroups.flatMap(
  (group) => {
    const actions = addableActions.filter(
      ({ groupId }) => groupId === group.groupId,
    );

    return actions.length > 0 ? [{ ...group, actions }] : [];
  },
);

/** The actions whose name contains `query`, ignoring case, in the order their groups list them. */
export const searchAddableActions = (query: string): AddableAction[] => {
  const needle = query.trim().toLowerCase();

  return addableActionGroups
    .flatMap(({ actions }) => actions)
    .filter(({ label }) => label.toLowerCase().includes(needle));
};

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

  const addable = findAddableAction(step.actionDefinitionId);

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

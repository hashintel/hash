import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/action-definitions";

import type { IconName } from "@hashintel/ds-components";
import type {
  ActionDefinition,
  FlowActionDefinitionId,
  StepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";

/** A definition may name an action that doesn't exist. */
export const getActionDefinition = (actionDefinitionId: string) =>
  (
    actionDefinitions as Partial<
      Record<string, ActionDefinition<FlowActionDefinitionId>>
    >
  )[actionDefinitionId];

export const stepNoun = { singular: "step", plural: "steps" } as const;

export const countSteps = (count: number) =>
  `${count} ${count === 1 ? stepNoun.singular : stepNoun.plural}`;

/** A step's hue: its group's, or neutral for what belongs to no group, such as Start. */
export type StepTone =
  | "yellow"
  | "blue"
  | "pink"
  | "orange"
  | "green"
  | "purple"
  | "neutral";

/** In the order the Add tab and the add menu list them, each in the hue its steps' tiles take. */
const actionGroups = {
  people: { label: "People", icon: "user", tone: "yellow" },
  messages: { label: "Messages", icon: "at", tone: "blue" },
  ai: { label: "AI", icon: "sparkles", tone: "pink" },
  documents: { label: "Documents", icon: "download", tone: "orange" },
  entities: { label: "Entities", icon: "cube", tone: "green" },
  flowControl: { label: "Flow control", icon: "rotate", tone: "purple" },
} as const satisfies Record<
  string,
  { label: string; icon: IconName; tone: StepTone }
>;

type ActionGroupId = keyof typeof actionGroups;

export type AddableAction = {
  actionDefinitionId: FlowActionDefinitionId;
  /** What people call the action, which can differ from its definition's name. */
  label: string;
  description: string;
  groupId: ActionGroupId;
  icon: IconName;
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
    groupId: "ai",
    icon: "feather",
  },
  {
    actionDefinitionId: "getFileFromUrl",
    label: "Fetch file",
    description: "Download a file from a URL into HASH",
    groupId: "documents",
    icon: "download",
  },
  {
    actionDefinitionId: "queryEntities",
    label: "Find entities",
    description: "Search one or more entity types, with conditions",
    groupId: "entities",
    icon: "search",
  },
  {
    actionDefinitionId: "createEntity",
    label: "Create entity",
    description: "Add a new entity to the graph",
    groupId: "entities",
    icon: "squarePlus",
  },
  {
    actionDefinitionId: "updateEntity",
    label: "Update entity",
    description: "Change properties on an existing entity",
    groupId: "entities",
    icon: "edit",
  },
  {
    actionDefinitionId: "if",
    label: "If",
    description: "Send a value to Yes or No by a condition",
    groupId: "flowControl",
    icon: "diagramNodes",
  },
  {
    actionDefinitionId: "filterList",
    label: "Filter list",
    description: "Split a list into matching and other items",
    groupId: "flowControl",
    icon: "filter",
  },
  {
    actionDefinitionId: "find",
    label: "Find",
    description: "Pick the first item of a list that matches a condition",
    groupId: "flowControl",
    icon: "bullseye",
  },
  {
    actionDefinitionId: "orderBy",
    label: "Order by",
    description: "Sort a list by its items, one of their fields or a property",
    groupId: "flowControl",
    icon: "sortDown",
  },
  {
    actionDefinitionId: "takeFirst",
    label: "Take first",
    description: "Keep the first items of a list, up to a count",
    groupId: "flowControl",
    icon: "circleOne",
  },
  {
    actionDefinitionId: "aggregate",
    label: "Aggregate",
    description:
      "Count a list's items, or take their sum, average, minimum or maximum",
    groupId: "flowControl",
    icon: "function",
  },
];

/** The hue of an action's tile, which is its group's. */
export const getActionTone = ({ groupId }: Pick<AddableAction, "groupId">) =>
  actionGroups[groupId].tone;

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

export type ActionGroup = {
  groupId: ActionGroupId;
  label: string;
  icon: IconName;
  actions: AddableAction[];
};

/** The groups of actions in the Add tab and the add menu, leaving out any with nothing that can be added yet. */
export const addableActionGroups: ActionGroup[] = (
  Object.keys(actionGroups) as ActionGroupId[]
).flatMap((groupId) => {
  const { label, icon } = actionGroups[groupId];
  const actions = addableActions.filter((action) => action.groupId === groupId);

  return actions.length > 0 ? [{ groupId, label, icon, actions }] : [];
});

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

/** `group` is `undefined` for an action that can't be added, which belongs to no group. */
export const getStepDisplay = (
  step: StepDefinition<string>,
): {
  title: string;
  description: string;
  icon: IconName;
  tone: StepTone;
  group: string | undefined;
} => {
  if (step.kind === "for-each") {
    return {
      title: "For each",
      description: step.description,
      icon: "refresh",
      tone: actionGroups.flowControl.tone,
      group: actionGroups.flowControl.label,
    };
  }

  const addable = findAddableAction(step.actionDefinitionId);

  const definition = getActionDefinition(step.actionDefinitionId);

  return {
    title: addable?.label ?? definition?.name ?? step.actionDefinitionId,
    description: step.description,
    icon: addable?.icon ?? "lightning",
    tone: addable ? getActionTone(addable) : "neutral",
    group: addable ? actionGroups[addable.groupId].label : undefined,
  };
};

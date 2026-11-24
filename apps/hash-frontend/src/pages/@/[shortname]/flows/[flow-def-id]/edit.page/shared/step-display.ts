import { typedKeys } from "@local/advanced-types/typed-entries";
import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/action-definitions";

import type { TriggerKind } from "./flow-triggers";
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

/** In the order the Add tab and the add menu list them, each in the hue its steps' tiles take by default. */
const actionGroups = {
  people: { label: "People", icon: "user", tone: "yellow" },
  messages: { label: "Messages", icon: "at", tone: "blue" },
  documents: { label: "Documents", icon: "download", tone: "orange" },
  entities: { label: "Entities", icon: "cube", tone: "green" },
  /* The palette has no hue left for these, so they keep the one they had under Flow control. */
  lists: { label: "Lists", icon: "list", tone: "purple" },
  flowControl: { label: "Flow control", icon: "rotate", tone: "purple" },
} as const satisfies Record<
  string,
  { label: string; icon: IconName; tone: StepTone }
>;

type ActionGroupId = keyof typeof actionGroups;

type ActionListing = {
  /** What people call the action, which can differ from its definition's name. */
  label: string;
  description: string;
  groupId: ActionGroupId;
  icon: IconName;
  /** Set when the tile's hue isn't its group's: AI steps are pink in any group. */
  tone?: StepTone;
};

export type AddableAction = ActionListing & {
  actionDefinitionId: FlowActionDefinitionId;
};

/** In the designs but without a definition yet, so it is listed but can't be added. */
type UpcomingAction = ActionListing & { upcomingId: string };

export type ListedAction = AddableAction | UpcomingAction;

/** Shown on an upcoming action's row while it is hovered. */
export const upcomingNote = "Soon";

export const isAddableAction = (
  action: ListedAction,
): action is AddableAction => "actionDefinitionId" in action;

/** Also how a for-each step in a flow is shown. */
const forEachListing = {
  upcomingId: "forEach",
  label: "For each",
  description: "Run steps for every item",
  groupId: "flowControl",
  icon: "refresh",
} as const satisfies UpcomingAction;

/**
 * In the order each group lists them. Ask a person (FE-1987), Send email (FE-1832) and For each (FE-1915) can be added
 * once they have a definition. Wait (FE-2012) and the definitions kept from before the editor aren't listed.
 */
const listedActions: ListedAction[] = [
  {
    upcomingId: "askPerson",
    label: "Ask a person",
    description: "Ask someone to approve or reject",
    groupId: "people",
    icon: "user",
  },
  {
    upcomingId: "sendEmail",
    label: "Send email",
    description: "Send an email to people",
    groupId: "messages",
    icon: "at",
  },
  {
    actionDefinitionId: "draftMessage",
    label: "Draft email",
    description: "Write an email's subject and body",
    groupId: "messages",
    icon: "feather",
    tone: "pink",
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
    actionDefinitionId: "filterList",
    label: "Filter list",
    description: "Split a list into matching and other items",
    groupId: "lists",
    icon: "filter",
  },
  {
    actionDefinitionId: "find",
    label: "Find",
    description: "Pick the first item of a list that matches a condition",
    groupId: "lists",
    icon: "bullseye",
  },
  {
    actionDefinitionId: "orderBy",
    label: "Order by",
    description: "Sort a list by its items, one of their fields or a property",
    groupId: "lists",
    icon: "sortDown",
  },
  {
    actionDefinitionId: "takeFirst",
    label: "Take first",
    description: "Keep the first items of a list, up to a count",
    groupId: "lists",
    icon: "circleOne",
  },
  {
    actionDefinitionId: "aggregate",
    label: "Aggregate",
    description:
      "Count a list's items, or take their sum, average, minimum or maximum",
    groupId: "lists",
    icon: "function",
  },
  {
    actionDefinitionId: "if",
    label: "If",
    description: "Send a value to Yes or No by a condition",
    groupId: "flowControl",
    icon: "diagramNodes",
  },
  forEachListing,
];

const addableActions = listedActions.filter(isAddableAction);

/** The hue of an action's tile: its own if it names one, otherwise its group's. */
export const getActionTone = ({
  groupId,
  tone,
}: Pick<ActionListing, "groupId" | "tone">) =>
  tone ?? actionGroups[groupId].tone;

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
  actions: ListedAction[];
};

/** The groups of actions in the Add tab and the add menu, upcoming actions included. */
export const listedActionGroups: ActionGroup[] = typedKeys(actionGroups).map(
  (groupId) => ({
    groupId,
    label: actionGroups[groupId].label,
    icon: actionGroups[groupId].icon,
    actions: listedActions.filter((action) => action.groupId === groupId),
  }),
);

/** The listed actions whose name contains `query`, ignoring case, in the order their groups list them. */
export const searchListedActions = (query: string): ListedAction[] => {
  const needle = query.trim().toLowerCase();

  return listedActionGroups
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

export const triggerDisplays = {
  manual: { title: "Manual", icon: "user" },
  schedule: { title: "Schedule", icon: "calendar" },
} as const satisfies Record<TriggerKind, { title: string; icon: IconName }>;

/** `group` is `undefined` for an action that isn't listed, which belongs to no group. */
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
      title: forEachListing.label,
      description: step.description,
      icon: forEachListing.icon,
      tone: getActionTone(forEachListing),
      group: actionGroups[forEachListing.groupId].label,
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

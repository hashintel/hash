import {
  generateArcId,
  type PetrinautAiCommandToolInput,
  type PetrinautAiCommandToolName,
  type PetrinautAiMutationToolInput,
  type PetrinautAiMutationToolName,
  type SDCPN,
  type SelectionItem,
} from "@hashintel/petrinaut-core";

import type { ReadOnlyReason } from "../../../../../react/state/use-read-only-reason";

export type AiToolSummary = {
  title: string;
  detail?: string;
  items?: string[];
  target?: AiToolTarget;
};

export type AiToolBlockedOutput = {
  applied: false;
  blocked: ReadOnlyReason["kind"];
  reason: string;
};

export type AiToolDeclinedOutput = {
  applied: false;
  reason: string;
};

export type AiToolOutput =
  | (AiToolSummary & { applied: true })
  | AiToolBlockedOutput
  | AiToolDeclinedOutput;

export type AiToolTarget =
  | { kind: "selection"; item: SelectionItem }
  | { kind: "simulateView"; mode: "scenarios" | "metrics"; itemId?: string };

export type AiToolSummaryContext = {
  definition?: SDCPN;
};

export const toPetrinautAiToolOutput = (
  summary: AiToolSummary,
): AiToolOutput => ({
  ...summary,
  applied: true,
});

export type AiToolAppliedSummary = AiToolSummary & { applied: true };

const prettifyToolName = (toolName: string): string =>
  toolName
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase());

const getName = (value: unknown): string | undefined => {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const maybeName = (value as { name?: unknown }).name;
  return typeof maybeName === "string" ? maybeName : undefined;
};

const findById = <Item extends { id: string }>(
  items: Item[] | undefined,
  id: string,
): Item | undefined => items?.find((item) => item.id === id);

const entityName = (
  definition: SDCPN | undefined,
  target: SelectionItem,
): string | undefined => {
  switch (target.type) {
    case "place":
      return findById(definition?.places, target.id)?.name;
    case "transition":
      return findById(definition?.transitions, target.id)?.name;
    case "type":
      return findById(definition?.types, target.id)?.name;
    case "differentialEquation":
      return findById(definition?.differentialEquations, target.id)?.name;
    case "parameter":
      return findById(definition?.parameters, target.id)?.name;
    case "arc":
      return undefined;
  }
};

const scenarioName = (
  definition: SDCPN | undefined,
  scenarioId: string,
): string | undefined => findById(definition?.scenarios, scenarioId)?.name;

const metricName = (
  definition: SDCPN | undefined,
  metricId: string,
): string | undefined => findById(definition?.metrics, metricId)?.name;

const typeElementName = (
  definition: SDCPN | undefined,
  typeId: string,
  elementId: string,
): string | undefined =>
  findById(definition?.types, typeId)?.elements.find(
    (element) => element.elementId === elementId,
  )?.name;

const updatedOrExistingName = ({
  definitionName,
  id,
  update,
}: {
  definitionName?: string;
  id: string;
  update?: unknown;
}): string => getName(update) ?? definitionName ?? id;

const renameDetail = ({
  definitionName,
  update,
}: {
  definitionName?: string;
  update?: unknown;
}): string | undefined => {
  const updatedName = getName(update);

  return updatedName && definitionName && updatedName !== definitionName
    ? `Previous name: ${definitionName}`
    : undefined;
};

const targetName = (
  definition: SDCPN | undefined,
  target: SelectionItem,
): string => entityName(definition, target) ?? target.id;

const itemLabel = (
  definition: SDCPN | undefined,
  item: SelectionItem,
): string => {
  const typeLabel =
    item.type === "differentialEquation" ? "equation" : item.type;
  return `${typeLabel}: ${targetName(definition, item)}`;
};

const arcEndpointDetail = (
  definition: SDCPN | undefined,
  input: {
    placeId: string;
    transitionId: string;
  },
): string => {
  const place = targetName(definition, { type: "place", id: input.placeId });
  const transition = targetName(definition, {
    type: "transition",
    id: input.transitionId,
  });

  return `${place} <-> ${transition}`;
};

const arcTarget = (input: {
  arcDirection: "input" | "output";
  placeId: string;
  transitionId: string;
}): SelectionItem => ({
  type: "arc",
  id:
    input.arcDirection === "input"
      ? generateArcId({ inputId: input.placeId, outputId: input.transitionId })
      : generateArcId({ inputId: input.transitionId, outputId: input.placeId }),
});

const selectionTarget = (item: SelectionItem): AiToolTarget => ({
  kind: "selection",
  item,
});

export type AiToolCall =
  | {
      [Name in PetrinautAiMutationToolName]: {
        toolName: Name;
        input: PetrinautAiMutationToolInput<Name>;
      };
    }[PetrinautAiMutationToolName]
  | {
      [Name in PetrinautAiCommandToolName]: {
        toolName: Name;
        input: PetrinautAiCommandToolInput<Name>;
      };
    }[PetrinautAiCommandToolName];

export type AiToolApplyAutoLayoutSummaryContext = {
  commitCount: number;
};

export const summarizeApplyAutoLayout = (
  context: AiToolApplyAutoLayoutSummaryContext,
): AiToolSummary => {
  const { commitCount } = context;
  return {
    title:
      commitCount === 0
        ? "Auto-layout had no effect"
        : `Auto-laid out ${commitCount} node${commitCount === 1 ? "" : "s"}`,
  };
};

export const summarizePetrinautAiToolCall = (
  { input, toolName }: AiToolCall,
  context: AiToolSummaryContext = {},
): AiToolSummary => {
  const { definition } = context;

  switch (toolName) {
    case "addPlace":
      return {
        title: `Added place ${input.name}`,
        target: selectionTarget({ type: "place", id: input.id }),
      };
    case "updatePlace":
      return {
        title: `Updated place ${updatedOrExistingName({
          definitionName: entityName(definition, {
            type: "place",
            id: input.placeId,
          }),
          id: input.placeId,
          update: input.update,
        })}`,
        detail: renameDetail({
          definitionName: entityName(definition, {
            type: "place",
            id: input.placeId,
          }),
          update: input.update,
        }),
        target: selectionTarget({ type: "place", id: input.placeId }),
      };
    case "updatePlacePosition":
      return {
        title: `Moved place ${targetName(definition, {
          type: "place",
          id: input.placeId,
        })}`,
        target: selectionTarget({ type: "place", id: input.placeId }),
      };
    case "removePlace":
      return {
        title: `Removed place ${targetName(definition, {
          type: "place",
          id: input.placeId,
        })}`,
      };
    case "addTransition":
      return {
        title: `Added transition ${input.name}`,
        target: selectionTarget({ type: "transition", id: input.id }),
      };
    case "updateTransition":
      return {
        title: `Updated transition ${updatedOrExistingName({
          definitionName: entityName(definition, {
            type: "transition",
            id: input.transitionId,
          }),
          id: input.transitionId,
          update: input.update,
        })}`,
        detail: renameDetail({
          definitionName: entityName(definition, {
            type: "transition",
            id: input.transitionId,
          }),
          update: input.update,
        }),
        target: selectionTarget({ type: "transition", id: input.transitionId }),
      };
    case "updateTransitionPosition":
      return {
        title: `Moved transition ${targetName(definition, {
          type: "transition",
          id: input.transitionId,
        })}`,
        target: selectionTarget({ type: "transition", id: input.transitionId }),
      };
    case "removeTransition":
      return {
        title: `Removed transition ${targetName(definition, {
          type: "transition",
          id: input.transitionId,
        })}`,
      };
    case "addArc":
      return {
        title: `Added ${input.arcDirection} arc`,
        detail: arcEndpointDetail(definition, input),
        target: selectionTarget(arcTarget(input)),
      };
    case "removeArc":
      return {
        title: `Removed ${input.arcDirection} arc`,
        detail: arcEndpointDetail(definition, input),
      };
    case "updateArcWeight":
      return {
        title: "Updated arc weight",
        detail: `${arcEndpointDetail(definition, input)}: ${input.weight}`,
        target: selectionTarget(arcTarget(input)),
      };
    case "updateArcType":
      return {
        title: "Updated input arc type",
        detail: `${arcEndpointDetail(definition, input)}: ${input.type}`,
        target: selectionTarget(arcTarget({ ...input, arcDirection: "input" })),
      };
    case "updateArcPlace":
      return {
        title: "Updated arc endpoint",
        detail: `${targetName(definition, {
          type: "place",
          id: input.oldPlaceId,
        })} -> ${targetName(definition, {
          type: "place",
          id: input.newPlaceId,
        })}`,
      };
    case "addType":
      return {
        title: `Added type ${input.name}`,
        target: selectionTarget({ type: "type", id: input.id }),
      };
    case "updateType":
      return {
        title: `Updated type ${updatedOrExistingName({
          definitionName: entityName(definition, {
            type: "type",
            id: input.typeId,
          }),
          id: input.typeId,
          update: input.update,
        })}`,
        detail: renameDetail({
          definitionName: entityName(definition, {
            type: "type",
            id: input.typeId,
          }),
          update: input.update,
        }),
        target: selectionTarget({ type: "type", id: input.typeId }),
      };
    case "removeType":
      return {
        title: `Removed type ${targetName(definition, {
          type: "type",
          id: input.typeId,
        })}`,
      };
    case "addTypeElement":
      return {
        title: `Added type element ${input.element.name}`,
        detail: input.typeId,
        target: selectionTarget({ type: "type", id: input.typeId }),
      };
    case "updateTypeElement":
      return {
        title: `Updated type element ${updatedOrExistingName({
          definitionName: typeElementName(
            definition,
            input.typeId,
            input.elementId,
          ),
          id: input.elementId,
          update: input.update,
        })}`,
        detail: targetName(definition, { type: "type", id: input.typeId }),
        target: selectionTarget({ type: "type", id: input.typeId }),
      };
    case "removeTypeElement":
      return {
        title: `Removed type element ${
          typeElementName(definition, input.typeId, input.elementId) ??
          input.elementId
        }`,
        detail: targetName(definition, { type: "type", id: input.typeId }),
        target: selectionTarget({ type: "type", id: input.typeId }),
      };
    case "moveTypeElement":
      return {
        title: `Moved type element ${
          typeElementName(definition, input.typeId, input.elementId) ??
          input.elementId
        }`,
        detail: targetName(definition, { type: "type", id: input.typeId }),
        target: selectionTarget({ type: "type", id: input.typeId }),
      };
    case "addDifferentialEquation":
      return {
        title: `Added equation ${input.name}`,
        target: selectionTarget({ type: "differentialEquation", id: input.id }),
      };
    case "updateDifferentialEquation":
      return {
        title: `Updated equation ${updatedOrExistingName({
          definitionName: entityName(definition, {
            type: "differentialEquation",
            id: input.equationId,
          }),
          id: input.equationId,
          update: input.update,
        })}`,
        detail: renameDetail({
          definitionName: entityName(definition, {
            type: "differentialEquation",
            id: input.equationId,
          }),
          update: input.update,
        }),
        target: selectionTarget({
          type: "differentialEquation",
          id: input.equationId,
        }),
      };
    case "removeDifferentialEquation":
      return {
        title: `Removed equation ${targetName(definition, {
          type: "differentialEquation",
          id: input.equationId,
        })}`,
      };
    case "addParameter":
      return {
        title: `Added parameter ${input.name}`,
        target: selectionTarget({ type: "parameter", id: input.id }),
      };
    case "updateParameter":
      return {
        title: `Updated parameter ${updatedOrExistingName({
          definitionName: entityName(definition, {
            type: "parameter",
            id: input.parameterId,
          }),
          id: input.parameterId,
          update: input.update,
        })}`,
        detail: renameDetail({
          definitionName: entityName(definition, {
            type: "parameter",
            id: input.parameterId,
          }),
          update: input.update,
        }),
        target: selectionTarget({ type: "parameter", id: input.parameterId }),
      };
    case "removeParameter":
      return {
        title: `Removed parameter ${targetName(definition, {
          type: "parameter",
          id: input.parameterId,
        })}`,
      };
    case "addScenario":
      return {
        title: `Added scenario ${input.name}`,
        target: { kind: "simulateView", mode: "scenarios", itemId: input.id },
      };
    case "updateScenario":
      return {
        title: `Updated scenario ${updatedOrExistingName({
          definitionName: scenarioName(definition, input.scenarioId),
          id: input.scenarioId,
          update: input.update,
        })}`,
        detail: renameDetail({
          definitionName: scenarioName(definition, input.scenarioId),
          update: input.update,
        }),
        target: {
          kind: "simulateView",
          mode: "scenarios",
          itemId: input.scenarioId,
        },
      };
    case "removeScenario":
      return {
        title: `Removed scenario ${
          scenarioName(definition, input.scenarioId) ?? input.scenarioId
        }`,
      };
    case "addMetric":
      return {
        title: `Added metric ${input.name}`,
        target: { kind: "simulateView", mode: "metrics", itemId: input.id },
      };
    case "updateMetric":
      return {
        title: `Updated metric ${updatedOrExistingName({
          definitionName: metricName(definition, input.metricId),
          id: input.metricId,
          update: input.update,
        })}`,
        detail: renameDetail({
          definitionName: metricName(definition, input.metricId),
          update: input.update,
        }),
        target: {
          kind: "simulateView",
          mode: "metrics",
          itemId: input.metricId,
        },
      };
    case "removeMetric":
      return {
        title: `Removed metric ${
          metricName(definition, input.metricId) ?? input.metricId
        }`,
      };
    case "deleteItemsByIds":
      return {
        title: `Deleted ${input.items.length} item${
          input.items.length === 1 ? "" : "s"
        }`,
        items: input.items.map((item) => itemLabel(definition, item)),
      };
    case "commitNodePositions":
      return {
        title: `Moved ${input.commits.length} node${
          input.commits.length === 1 ? "" : "s"
        }`,
      };
    case "applyAutoLayout":
      return {
        title: input.askUserFirst
          ? "Requested auto-layout (awaiting user confirmation)"
          : "Auto-laid out the net",
      };
    default:
      return { title: prettifyToolName(toolName) };
  }
};

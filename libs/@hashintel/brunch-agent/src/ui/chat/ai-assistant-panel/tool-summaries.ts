import {
  generateArcId,
  getArcEndpointKey,
  mutationActionInputSchemas,
  placeArcEndpoint,
  type ArcEndpoint,
  type PetrinautAiCommandToolInput,
  type PetrinautAiCommandToolName,
  type PetrinautAiMutationToolInput,
  type PetrinautAiMutationToolName,
  type SDCPN,
  type SelectionItem,
} from "@hashintel/petrinaut-core";
import { describeRefusal } from "@hashintel/petrinaut/ui/plugin";

import type {
  EditRefusal,
  PetrinautRevealTarget,
} from "@hashintel/petrinaut/ui/plugin";

export type AiToolSummary = {
  title: string;
  detail?: string;
  items?: string[];
  target?: AiToolTarget;
  /**
   * External URL the tool row links to (opens in a new tab). Set for
   * read-only tools that surface a user-guide page so the user can open the
   * page they saw the assistant consult.
   */
  href?: string;
};

export type AiToolBlockedOutput = {
  applied: false;
  blocked: EditRefusal["kind"];
  reason: string;
};

/** The model-facing output for an edit the plugin API refused. */
export const toBlockedOutput = (refusal: EditRefusal): AiToolBlockedOutput => ({
  applied: false,
  blocked: refusal.kind,
  reason: describeRefusal(refusal),
});

export type AiToolDeclinedOutput = {
  applied: false;
  reason: string;
};

export type AiToolOutput =
  | (AiToolSummary & { applied: true })
  | AiToolBlockedOutput
  | AiToolDeclinedOutput;

export type AiToolTarget = PetrinautRevealTarget;

/**
 * Whether a summary names the requested action ("Remove scenario …") or its
 * confirmed result ("Removed scenario …"). Only a successful result may
 * claim the change happened.
 */
export type AiToolSummaryWording = "action" | "result";

export type AiToolSummaryContext = {
  definition?: SDCPN;
  /** Defaults to `"result"`, the wording of an applied mutation's output. */
  wording?: AiToolSummaryWording;
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

/** A selected element as the user reads it: its kind and name, or its ID when it has no name. */
export const itemLabel = (
  definition: SDCPN | undefined,
  item: SelectionItem,
): string => {
  const typeLabel =
    item.type === "differentialEquation" ? "equation" : item.type;
  return `${typeLabel}: ${targetName(definition, item)}`;
};

const normalizeArcToolEndpoint = (input: {
  placeId?: string;
  endpoint?: ArcEndpoint;
}): ArcEndpoint => input.endpoint ?? placeArcEndpoint(input.placeId ?? "");

const componentPortName = (
  definition: SDCPN | undefined,
  endpoint: Extract<ArcEndpoint, { kind: "componentPort" }>,
): string => {
  const instance = definition?.componentInstances?.find(
    ({ id }) => id === endpoint.componentInstanceId,
  );
  const subnet = definition?.subnets?.find(
    ({ id }) => id === instance?.subnetId,
  );
  const port = subnet?.places.find(
    (place) => place.id === endpoint.portPlaceId,
  );
  return `${instance?.name ?? endpoint.componentInstanceId}.${
    port?.name ?? endpoint.portPlaceId
  }`;
};

const arcEndpointDetail = (
  definition: SDCPN | undefined,
  input: {
    placeId?: string;
    endpoint?: ArcEndpoint;
    transitionId: string;
  },
): string => {
  const endpoint = normalizeArcToolEndpoint(input);
  const place =
    endpoint.kind === "place"
      ? targetName(definition, { type: "place", id: endpoint.placeId })
      : componentPortName(definition, endpoint);
  const transition = targetName(definition, {
    type: "transition",
    id: input.transitionId,
  });

  return `${place} <-> ${transition}`;
};

const addArcTitle = (
  added: string,
  input: {
    arcDirection: "input" | "output";
    type?: "standard" | "read" | "inhibitor";
  },
): string => {
  if (
    input.arcDirection === "input" &&
    input.type !== undefined &&
    input.type !== "standard"
  ) {
    return `${added} ${input.type} input arc`;
  }

  return `${added} ${input.arcDirection} arc`;
};

const arcTarget = (input: {
  arcDirection: "input" | "output";
  placeId?: string;
  endpoint?: ArcEndpoint;
  transitionId: string;
}): SelectionItem => ({
  type: "arc",
  id:
    input.arcDirection === "input"
      ? generateArcId({
          inputId: getArcEndpointKey(normalizeArcToolEndpoint(input)),
          outputId: input.transitionId,
        })
      : generateArcId({
          inputId: input.transitionId,
          outputId: getArcEndpointKey(normalizeArcToolEndpoint(input)),
        }),
});

const endpointNameFromUpdateInput = (
  definition: SDCPN | undefined,
  input: {
    placeId?: string;
    endpoint?: ArcEndpoint;
  },
): string => {
  const endpoint = input.endpoint ?? placeArcEndpoint(input.placeId ?? "");
  return endpoint.kind === "place"
    ? targetName(definition, { type: "place", id: endpoint.placeId })
    : componentPortName(definition, endpoint);
};

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

/** A mutation call with its input parsed, so its ids are the converted ids the document stores. */
const withConvertedIds = (call: AiToolCall): AiToolCall => {
  if (!Object.hasOwn(mutationActionInputSchemas, call.toolName)) {
    return call;
  }
  const parsed = mutationActionInputSchemas[
    call.toolName as PetrinautAiMutationToolName
  ].safeParse(call.input);
  return parsed.success
    ? ({ ...call, input: parsed.data } as AiToolCall)
    : call;
};

export const summarizePetrinautAiToolCall = (
  call: AiToolCall,
  context: AiToolSummaryContext = {},
): AiToolSummary => {
  const { definition, wording = "result" } = context;
  const { input, toolName } = withConvertedIds(call);
  const asAction = wording === "action";
  const added = asAction ? "Add" : "Added";
  const updated = asAction ? "Update" : "Updated";
  const moved = asAction ? "Move" : "Moved";
  const removed = asAction ? "Remove" : "Removed";
  const deleted = asAction ? "Delete" : "Deleted";

  switch (toolName) {
    case "addPlace":
      return {
        title: `${added} place ${input.name}`,
        target: selectionTarget({ type: "place", id: input.id }),
      };
    case "updatePlace":
      return {
        title: `${updated} place ${updatedOrExistingName({
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
        title: `${moved} place ${targetName(definition, {
          type: "place",
          id: input.placeId,
        })}`,
        target: selectionTarget({ type: "place", id: input.placeId }),
      };
    case "removePlace":
      return {
        title: `${removed} place ${targetName(definition, {
          type: "place",
          id: input.placeId,
        })}`,
      };
    case "addTransition":
      return {
        title: `${added} transition ${input.name}`,
        target: selectionTarget({ type: "transition", id: input.id }),
      };
    case "updateTransition":
      return {
        title: `${updated} transition ${updatedOrExistingName({
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
        title: `${moved} transition ${targetName(definition, {
          type: "transition",
          id: input.transitionId,
        })}`,
        target: selectionTarget({ type: "transition", id: input.transitionId }),
      };
    case "removeTransition":
      return {
        title: `${removed} transition ${targetName(definition, {
          type: "transition",
          id: input.transitionId,
        })}`,
      };
    case "addArc":
      return {
        title: addArcTitle(added, input),
        detail: arcEndpointDetail(definition, input),
        target: selectionTarget(arcTarget(input)),
      };
    case "removeArc":
      return {
        title: `${removed} ${input.arcDirection} arc`,
        detail: arcEndpointDetail(definition, input),
      };
    case "updateArcWeight":
      return {
        title: `${updated} arc weight`,
        detail: `${arcEndpointDetail(definition, input)}: ${input.weight}`,
        target: selectionTarget(arcTarget(input)),
      };
    case "updateArcType":
      return {
        title: `${updated} input arc type`,
        detail: `${arcEndpointDetail(definition, input)}: ${input.type}`,
        target: selectionTarget(arcTarget({ ...input, arcDirection: "input" })),
      };
    case "updateArcPlace":
      return {
        title: `${updated} arc endpoint`,
        detail: `${endpointNameFromUpdateInput(definition, {
          placeId: input.oldPlaceId,
          endpoint: input.oldEndpoint,
        })} -> ${endpointNameFromUpdateInput(definition, {
          placeId: input.newPlaceId,
          endpoint: input.newEndpoint,
        })}`,
      };
    case "addType":
      return {
        title: `${added} type ${input.name}`,
        target: selectionTarget({ type: "type", id: input.id }),
      };
    case "updateType":
      return {
        title: `${updated} type ${updatedOrExistingName({
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
        title: `${removed} type ${targetName(definition, {
          type: "type",
          id: input.typeId,
        })}`,
      };
    case "addTypeElement":
      return {
        title: `${added} type element ${input.element.name}`,
        detail: input.typeId,
        target: selectionTarget({ type: "type", id: input.typeId }),
      };
    case "updateTypeElement":
      return {
        title: `${updated} type element ${updatedOrExistingName({
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
        title: `${removed} type element ${
          typeElementName(definition, input.typeId, input.elementId) ??
          input.elementId
        }`,
        detail: targetName(definition, { type: "type", id: input.typeId }),
        target: selectionTarget({ type: "type", id: input.typeId }),
      };
    case "moveTypeElement":
      return {
        title: `${moved} type element ${
          typeElementName(definition, input.typeId, input.elementId) ??
          input.elementId
        }`,
        detail: targetName(definition, { type: "type", id: input.typeId }),
        target: selectionTarget({ type: "type", id: input.typeId }),
      };
    case "addDifferentialEquation":
      return {
        title: `${added} equation ${input.name}`,
        target: selectionTarget({ type: "differentialEquation", id: input.id }),
      };
    case "updateDifferentialEquation":
      return {
        title: `${updated} equation ${updatedOrExistingName({
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
        title: `${removed} equation ${targetName(definition, {
          type: "differentialEquation",
          id: input.equationId,
        })}`,
      };
    case "addParameter":
      return {
        title: `${added} parameter ${input.name}`,
        target: selectionTarget({ type: "parameter", id: input.id }),
      };
    case "updateParameter":
      return {
        title: `${updated} parameter ${updatedOrExistingName({
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
        title: `${removed} parameter ${targetName(definition, {
          type: "parameter",
          id: input.parameterId,
        })}`,
      };
    case "addScenario":
      return {
        title: `${added} scenario ${input.name}`,
        target: { kind: "simulateView", mode: "scenarios", itemId: input.id },
      };
    case "updateScenario":
      return {
        title: `${updated} scenario ${updatedOrExistingName({
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
        title: `${removed} scenario ${
          scenarioName(definition, input.scenarioId) ?? input.scenarioId
        }`,
      };
    case "addMetric":
      return {
        title: `${added} metric ${input.name}`,
        target: { kind: "simulateView", mode: "metrics", itemId: input.id },
      };
    case "updateMetric":
      return {
        title: `${updated} metric ${updatedOrExistingName({
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
        title: `${removed} metric ${
          metricName(definition, input.metricId) ?? input.metricId
        }`,
      };
    case "deleteItemsByIds":
      return {
        title: `${deleted} ${input.items.length} item${
          input.items.length === 1 ? "" : "s"
        }`,
        items: input.items.map((item) => itemLabel(definition, item)),
      };
    case "commitNodePositions":
      return {
        title: `${moved} ${input.commits.length} node${
          input.commits.length === 1 ? "" : "s"
        }`,
      };
    case "applyAutoLayout":
      return {
        title: input.askUserFirst
          ? asAction
            ? "Request auto-layout"
            : "Requested auto-layout (awaiting user confirmation)"
          : asAction
            ? "Auto-lay out the net"
            : "Auto-laid out the net",
      };
    default:
      return { title: prettifyToolName(toolName) };
  }
};

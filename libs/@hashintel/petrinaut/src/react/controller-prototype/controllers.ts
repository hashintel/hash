/**
 * Controller prototype: the data model and the rules that read it.
 *
 * A controller names the parts of a net an AI policy may decide. Each part is
 * a lever of one kind. Controllers are kept in `SDCPN.metadata` under
 * {@link CONTROLLERS_METADATA_KEY}, so the prototype needs no schema change.
 */

import { getArcEndpoint } from "@hashintel/petrinaut-core";

import type { ArcEndpoint, JsonValue, SDCPN } from "@hashintel/petrinaut-core";

const placeIdOf = (endpoint: ArcEndpoint): string | null =>
  endpoint.kind === "place" ? endpoint.placeId : null;

export const CONTROLLERS_METADATA_KEY = "controllerPrototype";

export type LeverKind = "choice" | "rate" | "initialTokens" | "tokenField";

export type Lever =
  | {
      id: string;
      kind: "choice";
      /** The place whose outgoing transitions compete. */
      placeId: string;
      /** The competing transitions the controller decides. The rest stay stochastic. */
      transitionIds: string[];
    }
  | { id: string; kind: "rate"; transitionId: string }
  | { id: string; kind: "initialTokens"; placeId: string }
  | {
      id: string;
      kind: "tokenField";
      transitionId: string;
      /** The output place whose token type holds the field. */
      placeId: string;
      elementId: string;
    };

export type Controller = {
  id: string;
  name: string;
  levers: Lever[];
};

export const leverKindLabel: Record<LeverKind, string> = {
  choice: "Choice",
  rate: "Rate",
  initialTokens: "Initial tokens",
  tokenField: "Token field",
};

export const leverKindOrder: LeverKind[] = [
  "choice",
  "rate",
  "initialTokens",
  "tokenField",
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseLever = (raw: unknown): Lever | null => {
  if (!isRecord(raw) || typeof raw.id !== "string") {
    return null;
  }
  switch (raw.kind) {
    case "choice":
      return typeof raw.placeId === "string" && Array.isArray(raw.transitionIds)
        ? {
            id: raw.id,
            kind: "choice",
            placeId: raw.placeId,
            transitionIds: raw.transitionIds.filter(
              (id): id is string => typeof id === "string",
            ),
          }
        : null;
    case "rate":
      return typeof raw.transitionId === "string"
        ? { id: raw.id, kind: "rate", transitionId: raw.transitionId }
        : null;
    case "initialTokens":
      return typeof raw.placeId === "string"
        ? { id: raw.id, kind: "initialTokens", placeId: raw.placeId }
        : null;
    case "tokenField":
      return typeof raw.transitionId === "string" &&
        typeof raw.placeId === "string" &&
        typeof raw.elementId === "string"
        ? {
            id: raw.id,
            kind: "tokenField",
            transitionId: raw.transitionId,
            placeId: raw.placeId,
            elementId: raw.elementId,
          }
        : null;
    default:
      return null;
  }
};

/** Reads the controllers from a net, dropping any entry that does not parse. */
export const readControllers = (sdcpn: SDCPN): Controller[] => {
  const raw = sdcpn.metadata?.[CONTROLLERS_METADATA_KEY];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((entry): Controller[] => {
    if (
      !isRecord(entry) ||
      typeof entry.id !== "string" ||
      typeof entry.name !== "string" ||
      !Array.isArray(entry.levers)
    ) {
      return [];
    }
    return [
      {
        id: entry.id,
        name: entry.name,
        levers: entry.levers.flatMap((lever) => {
          const parsed = parseLever(lever);
          return parsed ? [parsed] : [];
        }),
      },
    ];
  });
};

export const writeControllers = (
  draft: SDCPN,
  controllers: Controller[],
): void => {
  draft.metadata = {
    ...draft.metadata,
    [CONTROLLERS_METADATA_KEY]: controllers as unknown as JsonValue,
  };
};

/** The canvas nodes a lever takes over: these show the lever glyph and ring when the controller is selected. */
export const leverNodeIds = (lever: Lever): string[] => {
  switch (lever.kind) {
    case "choice":
      return lever.transitionIds;
    case "rate":
    case "tokenField":
      return [lever.transitionId];
    case "initialTokens":
      return [lever.placeId];
  }
};

/** The node a lever row points at: the branch place for a Choice, else the node it takes over. */
export const leverAnchorId = (lever: Lever): string => {
  switch (lever.kind) {
    case "choice":
    case "initialTokens":
      return lever.placeId;
    case "rate":
    case "tokenField":
      return lever.transitionId;
  }
};

type NetLike = Pick<SDCPN, "places" | "transitions" | "types">;

/**
 * The transitions that compete for a place's tokens: every transition with a
 * standard input arc from it. Read and inhibitor arcs do not consume, so they
 * do not compete.
 */
export const competingTransitionIds = (
  net: NetLike,
  placeId: string,
): string[] =>
  net.transitions
    .filter((transition) =>
      transition.inputArcs.some(
        (arc) =>
          arc.type === "standard" && placeIdOf(getArcEndpoint(arc)) === placeId,
      ),
    )
    .map((transition) => transition.id);

export const outputPlaceIds = (net: NetLike, transitionId: string): string[] =>
  (
    net.transitions.find((t) => t.id === transitionId)?.outputArcs ?? []
  ).flatMap((arc) => {
    const id = placeIdOf(getArcEndpoint(arc));
    return id === null ? [] : [id];
  });

/** The name shown for a lever, or null when the node it points at is gone. */
export const leverName = (net: NetLike, lever: Lever): string | null => {
  const anchor = leverAnchorId(lever);
  const node =
    net.places.find((p) => p.id === anchor) ??
    net.transitions.find((t) => t.id === anchor);
  return node ? node.name : null;
};

export const leverAnchorKind = (lever: Lever): "place" | "transition" =>
  lever.kind === "choice" || lever.kind === "initialTokens"
    ? "place"
    : "transition";

/** Every controller that holds a lever over the node, with the kinds it holds. */
export const controllersOfNode = (
  controllers: Controller[],
  nodeId: string,
): { controller: Controller; kinds: LeverKind[] }[] =>
  controllers.flatMap((controller) => {
    const kinds = controller.levers
      .filter((lever) => leverNodeIds(lever).includes(nodeId))
      .map((lever) => lever.kind);
    return kinds.length > 0 ? [{ controller, kinds }] : [];
  });

/**
 * What a transition's rate code returns today, when it is one short
 * expression such as `parameters.supplier_a_order_rate`. A longer formula
 * returns null.
 */
export const rateExpression = (lambdaCode: string): string | null => {
  const withoutComments = lambdaCode
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n")
    .trim();
  const match = /^return\s+([^;]+);?$/.exec(withoutComments);
  if (!match) {
    return null;
  }
  const expression = match[1]!.trim();
  return expression.length <= 48 ? expression : null;
};

/** Drops controllers from a selection, for actions that only know net entities. */
export const withoutControllers = <Item extends { type: string }>(
  items: Item[],
): Exclude<Item, { type: "controller" }>[] =>
  items.filter(
    (item): item is Exclude<Item, { type: "controller" }> =>
      item.type !== "controller",
  );

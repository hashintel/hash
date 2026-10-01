/**
 * Controller prototype: the data model and the rules that read it.
 *
 * A controller names the parts of a net an AI policy may decide. Each part is
 * a lever of one kind. Controllers are kept in `SDCPN.metadata` under
 * {@link CONTROLLERS_METADATA_KEY}, so the prototype needs no schema change.
 */

import { getArcEndpoint } from "@hashintel/petrinaut-core";

import type {
  ArcEndpoint,
  ColorElementType,
  JsonValue,
  SDCPN,
} from "@hashintel/petrinaut-core";

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
  | {
      id: string;
      kind: "initialTokens";
      placeId: string;
      /** Fields of the place's token type the controller sets, besides the count. */
      elementIds?: string[];
    }
  | {
      id: string;
      kind: "tokenField";
      transitionId: string;
      /** Per output place, the fields of its token type the controller sets. */
      places: { placeId: string; elementIds: string[] }[];
    };

export type GoalDirection = "maximise" | "minimise";

export type Controller = {
  id: string;
  name: string;
  levers: Lever[];
  /** Ids from {@link standInConstraints} the controller must respect. */
  constraintIds?: string[];
  goal?: { direction: GoalDirection; metricId: string };
};

/** The net has no constraints to read yet, so the prototype offers this fixed list. */
export const standInConstraints: { id: string; name: string }[] = [
  { id: "backorders_under_20", name: "Backorders stay under 20" },
  { id: "machine_health_above_0_2", name: "Machine health above 0.2" },
  { id: "scrap_under_5", name: "Scrap under 5% of batches" },
  { id: "order_wait_under_14_days", name: "No order waits over 14 days" },
];

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
        ? {
            id: raw.id,
            kind: "initialTokens",
            placeId: raw.placeId,
            ...(Array.isArray(raw.elementIds)
              ? {
                  elementIds: raw.elementIds.filter(
                    (id): id is string => typeof id === "string",
                  ),
                }
              : {}),
          }
        : null;
    case "tokenField": {
      if (typeof raw.transitionId !== "string") {
        return null;
      }
      if (
        typeof raw.placeId === "string" &&
        typeof raw.elementId === "string"
      ) {
        return {
          id: raw.id,
          kind: "tokenField",
          transitionId: raw.transitionId,
          places: [{ placeId: raw.placeId, elementIds: [raw.elementId] }],
        };
      }
      if (!Array.isArray(raw.places)) {
        return null;
      }
      return {
        id: raw.id,
        kind: "tokenField",
        transitionId: raw.transitionId,
        places: raw.places.flatMap((entry) =>
          isRecord(entry) &&
          typeof entry.placeId === "string" &&
          Array.isArray(entry.elementIds)
            ? [
                {
                  placeId: entry.placeId,
                  elementIds: entry.elementIds.filter(
                    (id): id is string => typeof id === "string",
                  ),
                },
              ]
            : [],
        ),
      };
    }
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
        ...(Array.isArray(entry.constraintIds)
          ? {
              constraintIds: entry.constraintIds.filter(
                (id): id is string => typeof id === "string",
              ),
            }
          : {}),
        ...(isRecord(entry.goal) &&
        (entry.goal.direction === "maximise" ||
          entry.goal.direction === "minimise") &&
        typeof entry.goal.metricId === "string"
          ? {
              goal: {
                direction: entry.goal.direction,
                metricId: entry.goal.metricId,
              },
            }
          : {}),
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

export type TokenFieldPlace = {
  placeId: string;
  placeName: string;
  typeName: string;
  displayColor: string;
  fields: { elementId: string; name: string; type: ColorElementType }[];
};

/** A place with its token type's fields, or null for an untyped place. */
export const typedPlace = (
  net: NetLike,
  placeId: string,
): TokenFieldPlace | null => {
  const place = net.places.find((p) => p.id === placeId);
  const type = net.types.find((t) => t.id === place?.colorId);
  return place && type
    ? {
        placeId,
        placeName: place.name,
        typeName: type.name,
        displayColor: type.displayColor,
        fields: type.elements.map(({ elementId, name, type: kind }) => ({
          elementId,
          name,
          type: kind,
        })),
      }
    : null;
};

/** The output places of a transition that hold typed tokens, with the fields of each token type. */
export const tokenFieldPlaces = (
  net: NetLike,
  transitionId: string,
): TokenFieldPlace[] =>
  [...new Set(outputPlaceIds(net, transitionId))].flatMap((placeId) => {
    const typed = typedPlace(net, placeId);
    return typed ? [typed] : [];
  });

/** Ticks or unticks one field of an Initial tokens lever, keeping the token type's field order. */
export const toggleInitialTokenField = (
  net: NetLike,
  controller: Controller,
  leverId: string,
  elementId: string,
  on: boolean,
): Controller => ({
  ...controller,
  levers: controller.levers.map((lever) => {
    if (lever.id !== leverId || lever.kind !== "initialTokens") {
      return lever;
    }
    const chosen = new Set(lever.elementIds ?? []);
    if (on) {
      chosen.add(elementId);
    } else {
      chosen.delete(elementId);
    }
    const order = typedPlace(net, lever.placeId)?.fields ?? [];
    return {
      ...lever,
      elementIds: order
        .map((field) => field.elementId)
        .filter((id) => chosen.has(id)),
    };
  }),
});

/** How many fields a Token field lever sets in all. */
export const tokenFieldCount = (
  lever: Extract<Lever, { kind: "tokenField" }>,
): number =>
  lever.places.reduce((count, entry) => count + entry.elementIds.length, 0);

/**
 * Ticks or unticks one field in the controller's Token field lever for a
 * transition, creating the lever when it is missing. The lever stays when its
 * last field is unticked. Fields keep the order of their token type.
 */
export const toggleTokenField = (
  net: NetLike,
  controller: Controller,
  transitionId: string,
  placeId: string,
  elementId: string,
  on: boolean,
  makeId: () => string,
): Controller => {
  const existing = controller.levers.find(
    (lever): lever is Extract<Lever, { kind: "tokenField" }> =>
      lever.kind === "tokenField" && lever.transitionId === transitionId,
  );
  const current = existing?.places.find((entry) => entry.placeId === placeId);
  const chosen = new Set(current?.elementIds ?? []);
  if (on) {
    chosen.add(elementId);
  } else {
    chosen.delete(elementId);
  }
  const outputs = tokenFieldPlaces(net, transitionId);
  const typeOrder =
    outputs
      .find((place) => place.placeId === placeId)
      ?.fields.map((field) => field.elementId) ?? [];
  const elementIds = typeOrder.filter((id) => chosen.has(id));
  const placeOrder = outputs.map((place) => place.placeId);
  const places = [
    ...(existing?.places.filter((entry) => entry.placeId !== placeId) ?? []),
    ...(elementIds.length > 0 ? [{ placeId, elementIds }] : []),
  ].sort(
    (a, b) => placeOrder.indexOf(a.placeId) - placeOrder.indexOf(b.placeId),
  );
  const lever: Lever = {
    id: existing?.id ?? makeId(),
    kind: "tokenField",
    transitionId,
    places,
  };
  return {
    ...controller,
    levers: existing
      ? controller.levers.map((candidate) =>
          candidate === existing ? lever : candidate,
        )
      : [...controller.levers, lever],
  };
};

/**
 * Points a lever at another node of the same kind. Fields that still exist
 * stay ticked: for a Token field, each output place keeps the fields it had,
 * or those of an old place with the same token type; for Initial tokens, the
 * fields the new place's token type also has.
 */
export const retargetLever = (
  net: NetLike,
  lever: Lever,
  targetId: string,
): Lever => {
  switch (lever.kind) {
    case "choice":
      return lever;
    case "rate":
      return { ...lever, transitionId: targetId };
    case "initialTokens": {
      const fields =
        typedPlace(net, targetId)?.fields.map((field) => field.elementId) ??
        [];
      const kept = (lever.elementIds ?? []).filter((id) =>
        fields.includes(id),
      );
      return {
        id: lever.id,
        kind: "initialTokens",
        placeId: targetId,
        ...(kept.length > 0 ? { elementIds: kept } : {}),
      };
    }
    case "tokenField": {
      const colorOf = (placeId: string) =>
        net.places.find((place) => place.id === placeId)?.colorId;
      const places = tokenFieldPlaces(net, targetId).flatMap((place) => {
        const held =
          lever.places.find((entry) => entry.placeId === place.placeId) ??
          lever.places.find(
            (entry) => colorOf(entry.placeId) === colorOf(place.placeId),
          );
        const elementIds = place.fields
          .map((field) => field.elementId)
          .filter((id) => held?.elementIds.includes(id));
        return elementIds.length > 0
          ? [{ placeId: place.placeId, elementIds }]
          : [];
      });
      return { ...lever, transitionId: targetId, places };
    }
  }
};

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

export type TransitionPart = "firing" | "results";

export type TransitionPartHolder = {
  controller: Controller;
  fieldCount: number;
};

/**
 * The controllers that decide one part of a transition: its firing (Rate, or a
 * Choice that includes it) or its results (Token field). `fieldCount` is the
 * number of Token fields set, 0 for firing.
 */
export const transitionPartHolders = (
  controllers: Controller[],
  transitionId: string,
  part: TransitionPart,
): TransitionPartHolder[] =>
  controllers.flatMap((controller) => {
    const levers = controller.levers.filter((lever) =>
      part === "results"
        ? lever.kind === "tokenField" && lever.transitionId === transitionId
        : (lever.kind === "rate" || lever.kind === "choice") &&
          leverNodeIds(lever).includes(transitionId),
    );
    const fieldCount = levers.reduce(
      (count, lever) =>
        count + (lever.kind === "tokenField" ? tokenFieldCount(lever) : 0),
      0,
    );
    return levers.length > 0 ? [{ controller, fieldCount }] : [];
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

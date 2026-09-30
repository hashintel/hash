/**
 * Which lever kinds fit a set of nodes, and how adding one changes a
 * controller. Pure, so the right-click menu and the multi-selection button
 * share one rule.
 */

import {
  competingTransitionIds,
  leverNodeIds,
  outputPlaceIds,
} from "./controllers";

import type { Controller, Lever } from "./controllers";
import type { SDCPN } from "@hashintel/petrinaut-core";

type NetLike = Pick<SDCPN, "places" | "transitions" | "types">;

/** A lever without its id: what an option adds. */
export type LeverDraft = Lever extends infer L
  ? L extends Lever
    ? Omit<L, "id">
    : never
  : never;

export type TokenFieldChoice = {
  placeId: string;
  placeName: string;
  elementId: string;
  fieldName: string;
};

export type LeverOption =
  | { id: string; label: string; levers: LeverDraft[] }
  | {
      id: string;
      label: string;
      /** Token field: pick a field of an output place's token type first. */
      fields: TokenFieldChoice[];
      transitionId: string;
    };

/**
 * The lever kinds that fit the targets:
 * - places: Initial tokens;
 * - transitions that compete for one place's tokens: Choice at that place;
 * - any transition: Rate;
 * - a single transition with typed output tokens: Token field;
 * - several transitions: Rate for each, plus Choice where they share a branch place.
 *
 * A mix of places and transitions fits no kind.
 */
export const leverOptionsFor = (
  net: NetLike,
  targetIds: string[],
): LeverOption[] => {
  const places = targetIds.filter((id) => net.places.some((p) => p.id === id));
  const transitions = targetIds.filter((id) =>
    net.transitions.some((t) => t.id === id),
  );

  if (places.length > 0 && transitions.length > 0) {
    return [];
  }

  if (places.length > 0) {
    return [
      {
        id: "initialTokens",
        label: "Initial tokens",
        levers: places.map((placeId) => ({ kind: "initialTokens", placeId })),
      },
    ];
  }

  if (transitions.length === 0) {
    return [];
  }

  const branchPlaces = net.places.filter((place) => {
    const competing = competingTransitionIds(net, place.id);
    return (
      competing.length >= 2 && transitions.every((id) => competing.includes(id))
    );
  });

  const choices: LeverOption[] = branchPlaces.map((place) => ({
    id: `choice:${place.id}`,
    label: `Choice at ${place.name}`,
    levers: [{ kind: "choice", placeId: place.id, transitionIds: transitions }],
  }));

  const rate: LeverOption = {
    id: "rate",
    label: "Rate",
    levers: transitions.map((transitionId) => ({ kind: "rate", transitionId })),
  };

  if (transitions.length > 1) {
    return [...choices, rate];
  }

  const transitionId = transitions[0]!;
  const fields = outputPlaceIds(net, transitionId).flatMap(
    (placeId): TokenFieldChoice[] => {
      const place = net.places.find((p) => p.id === placeId);
      const type = net.types.find((t) => t.id === place?.colorId);
      return place && type
        ? type.elements.map((element) => ({
            placeId,
            placeName: place.name,
            elementId: element.elementId,
            fieldName: element.name,
          }))
        : [];
    },
  );

  return fields.length > 0
    ? [
        ...choices,
        rate,
        { id: "tokenField", label: "Token field", fields, transitionId },
      ]
    : [...choices, rate];
};

const sameLever = (a: LeverDraft, b: Lever): boolean => {
  switch (a.kind) {
    case "choice":
      return b.kind === "choice" && b.placeId === a.placeId;
    case "rate":
      return b.kind === "rate" && b.transitionId === a.transitionId;
    case "initialTokens":
      return b.kind === "initialTokens" && b.placeId === a.placeId;
    case "tokenField":
      return (
        b.kind === "tokenField" &&
        b.transitionId === a.transitionId &&
        b.placeId === a.placeId &&
        b.elementId === a.elementId
      );
  }
};

/** Whether the controller already holds everything these drafts would add. */
export const holdsAll = (controller: Controller, drafts: LeverDraft[]) =>
  drafts.every((draft) =>
    controller.levers.some(
      (lever) =>
        sameLever(draft, lever) &&
        (draft.kind !== "choice" ||
          draft.transitionIds.every((id) => leverNodeIds(lever).includes(id))),
    ),
  );

/**
 * Adds the drafts to a controller. A Choice at a place the controller already
 * decides gains the new transitions; any other lever it already holds is
 * left as it is.
 */
export const addLevers = (
  controller: Controller,
  drafts: LeverDraft[],
  makeId: () => string,
): Controller => {
  let levers = controller.levers;
  for (const draft of drafts) {
    const existing = levers.find((lever) => sameLever(draft, lever));
    if (!existing) {
      levers = [...levers, { ...draft, id: makeId() } as Lever];
    } else if (draft.kind === "choice" && existing.kind === "choice") {
      levers = levers.map((lever) =>
        lever === existing
          ? {
              ...existing,
              transitionIds: [
                ...new Set([...existing.transitionIds, ...draft.transitionIds]),
              ],
            }
          : lever,
      );
    }
  }
  return { ...controller, levers };
};

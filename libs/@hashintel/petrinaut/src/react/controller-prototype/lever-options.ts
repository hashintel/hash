/**
 * Which lever kinds fit a set of nodes, and how adding one changes a
 * controller. Pure, so the right-click menu and the multi-selection button
 * share one rule.
 */

import { leverNodeIds, tokenFieldPlaces } from "./controllers";

import type { Controller, Lever, TokenFieldPlace } from "./controllers";
import type { SDCPN } from "@hashintel/petrinaut-core";

type NetLike = Pick<SDCPN, "places" | "transitions" | "types">;

/** A lever without its id: what an option adds. */
export type LeverDraft = Lever extends infer L
  ? L extends Lever
    ? Omit<L, "id">
    : never
  : never;

export type LeverOption =
  | { id: string; label: string; levers: LeverDraft[] }
  | {
      id: string;
      label: string;
      /** Token field: pick fields of the output places' token types first. */
      places: TokenFieldPlace[];
      transitionId: string;
    };

/**
 * The lever kinds that fit the targets:
 * - places: Initial tokens;
 * - any transition: Rate;
 * - a single transition with typed output tokens: Token field;
 * - several transitions: Rate for each.
 *
 * Rival transitions get a Rate lever each, like any other, so no option adds a
 * Choice. A mix of places and transitions fits no kind.
 */
export const leverOptionsFor = (
  net: NetLike,
  targetIds: string[]
): LeverOption[] => {
  const places = targetIds.filter((id) => net.places.some((p) => p.id === id));
  const transitions = targetIds.filter((id) =>
    net.transitions.some((t) => t.id === id)
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

  const rate: LeverOption = {
    id: "rate",
    label: "Rate",
    levers: transitions.map((transitionId) => ({ kind: "rate", transitionId })),
  };

  if (transitions.length > 1) {
    return [rate];
  }

  const transitionId = transitions[0]!;
  const outputs = tokenFieldPlaces(net, transitionId);

  return outputs.length > 0
    ? [
        rate,
        {
          id: "tokenField",
          label: "Token field",
          places: outputs,
          transitionId,
        },
      ]
    : [rate];
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
      return b.kind === "tokenField" && b.transitionId === a.transitionId;
  }
};

/** Whether the controller already holds everything these drafts would add. */
export const holdsAll = (controller: Controller, drafts: LeverDraft[]) =>
  drafts.every((draft) =>
    controller.levers.some(
      (lever) =>
        sameLever(draft, lever) &&
        (draft.kind !== "choice" ||
          draft.transitionIds.every((id) =>
            leverNodeIds(lever).includes(id)
          )) &&
        (draft.kind !== "tokenField" ||
          (lever.kind === "tokenField" &&
            draft.places.every((place) =>
              place.elementIds.every((elementId) =>
                lever.places.some(
                  (held) =>
                    held.placeId === place.placeId &&
                    held.elementIds.includes(elementId)
                )
              )
            )))
    )
  );

type TokenFieldPlaces = Extract<Lever, { kind: "tokenField" }>["places"];

const mergePlaces = (
  held: TokenFieldPlaces,
  added: TokenFieldPlaces
): TokenFieldPlaces => {
  const merged = held.map((entry) => ({
    ...entry,
    elementIds: [
      ...new Set([
        ...entry.elementIds,
        ...(added.find((a) => a.placeId === entry.placeId)?.elementIds ?? []),
      ]),
    ],
  }));
  return [
    ...merged,
    ...added.filter((a) => !held.some((entry) => entry.placeId === a.placeId)),
  ];
};

/**
 * Adds the drafts to a controller. A Choice at a place the controller already
 * decides gains the new transitions, and a Token field on a transition it
 * already sets gains the new fields; any other lever it already holds is
 * left as it is.
 */
export const addLevers = (
  controller: Controller,
  drafts: LeverDraft[],
  makeId: () => string
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
          : lever
      );
    } else if (draft.kind === "tokenField" && existing.kind === "tokenField") {
      levers = levers.map((lever) =>
        lever === existing
          ? {
              ...existing,
              places: mergePlaces(existing.places, draft.places),
            }
          : lever
      );
    }
  }
  return { ...controller, levers };
};

/**
 * The controller a Token field checklist edits: the one picked in the menu,
 * else the first that already sets fields on the transition, else the first.
 */
export const tokenFieldTarget = (
  controllers: Controller[],
  transitionId: string,
  pickedId: string | null
): Controller | undefined =>
  controllers.find((controller) => controller.id === pickedId) ??
  controllers.find((controller) =>
    controller.levers.some(
      (lever) =>
        lever.kind === "tokenField" && lever.transitionId === transitionId
    )
  ) ??
  controllers[0];

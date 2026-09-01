import {
  getActualModeTransitionFiringTimesMs,
  getStatusViewExitLabel,
} from "@hashintel/petrinaut-core";

import type {
  ActualModeTokenRecord,
  ActualModeTransitionFiring,
  SDCPN,
  StatusView,
} from "@hashintel/petrinaut-core";

export type ActualEventStatusChange = {
  /** The instance's key element values, joined for display. */
  keyDisplay: string;
  /** null when the firing first introduces the instance. */
  fromLabelName: string | null;
  /** null when the token left the view and it declares no exit label. */
  toLabelName: string | null;
  /** Time the instance spent in the previous label, ms; null without one. */
  dwellMs: number | null;
};

/**
 * Derives, per firing, the status changes its recorded token values caused
 * under one status view: which instances entered a new label and how long
 * they spent in the previous one. A place's label is the first non-exit
 * label listing it, in array order; an instance consumed without a produced
 * token carrying its key falls to the view's exit label. Firings without
 * token values cause no entries.
 */
export function deriveActualEventStatusChanges(args: {
  statusView: StatusView;
  definition: Pick<SDCPN, "places" | "types">;
  transitionFirings: readonly ActualModeTransitionFiring[];
}): ActualEventStatusChange[][] {
  const { statusView, definition, transitionFirings } = args;

  const labelNameByPlaceId = new Map<string, string>();
  for (const label of statusView.labels) {
    if (label.isExit) {
      continue;
    }
    for (const placeId of label.places) {
      if (!labelNameByPlaceId.has(placeId)) {
        labelNameByPlaceId.set(placeId, label.name);
      }
    }
  }

  const colorById = new Map(definition.types.map((color) => [color.id, color]));
  const keyElementNamesByPlaceId = new Map<string, string[]>();
  for (const place of definition.places) {
    const color = place.colorId ? colorById.get(place.colorId) : undefined;
    const keyElementNames = (color?.elements ?? [])
      .filter((element) => element.identityRef === statusView.identityRef)
      .map((element) => element.name);
    if (keyElementNames.length > 0) {
      keyElementNamesByPlaceId.set(place.id, keyElementNames);
    }
  }

  const exitLabelName = getStatusViewExitLabel(statusView)?.name ?? null;
  const firingTimesMs = getActualModeTransitionFiringTimesMs(
    transitionFirings,
    null,
    null,
  );

  const keyOf = (
    placeId: string,
    token: ActualModeTokenRecord,
  ): string | null => {
    const keyElementNames = keyElementNamesByPlaceId.get(placeId);
    if (!keyElementNames) {
      return null;
    }
    const keyValues: string[] = [];
    for (const elementName of keyElementNames) {
      const value = token[elementName];
      if (value === undefined) {
        return null;
      }
      keyValues.push(String(value));
    }
    return keyValues.join(", ");
  };

  const instanceState = new Map<
    string,
    { labelName: string | null; sinceMs: number }
  >();
  const changesByFiring: ActualEventStatusChange[][] = [];

  for (const [firingIndex, firing] of transitionFirings.entries()) {
    const timeMs = firingTimesMs[firingIndex] ?? 0;
    const changes: ActualEventStatusChange[] = [];

    const recordTransition = (
      keyDisplay: string,
      toLabelName: string | null,
    ): void => {
      const prior = instanceState.get(keyDisplay);
      if (prior && prior.labelName === toLabelName) {
        return;
      }
      changes.push({
        keyDisplay,
        fromLabelName: prior?.labelName ?? null,
        toLabelName,
        dwellMs: prior ? timeMs - prior.sinceMs : null,
      });
      instanceState.set(keyDisplay, {
        labelName: toLabelName,
        sinceMs: timeMs,
      });
    };

    const producedKeys = new Set<string>();
    for (const [placeId, tokens] of Object.entries(firing.outputTokens ?? {})) {
      for (const token of tokens) {
        const keyDisplay = keyOf(placeId, token);
        if (keyDisplay === null) {
          continue;
        }
        producedKeys.add(keyDisplay);
        recordTransition(keyDisplay, labelNameByPlaceId.get(placeId) ?? null);
      }
    }

    for (const [placeId, tokens] of Object.entries(firing.inputTokens ?? {})) {
      for (const token of tokens) {
        const keyDisplay = keyOf(placeId, token);
        if (keyDisplay === null || producedKeys.has(keyDisplay)) {
          continue;
        }
        recordTransition(keyDisplay, exitLabelName);
      }
    }

    changesByFiring.push(changes);
  }

  return changesByFiring;
}

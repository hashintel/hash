import {
  colorSchema,
  differentialEquationSchema,
  parameterSchema,
  placeSchema,
  transitionSchema,
} from "./action-schemas";
import { pastePayloadIntoSDCPN } from "./clipboard/paste";
import { commandActionInputSchemas } from "./command-schemas";
import { calculateGraphLayout } from "./layout/calculate-graph-layout";
import { layoutNodeDimensions } from "./layout/dimensions";

import type { ClipboardPayload } from "./clipboard/types";
import type { SDCPN } from "./types/sdcpn";

export type ApplyClipboardPasteResult = {
  newItemIds: Array<{ type: string; id: string }>;
};

export type ApplyAutoLayoutResult = {
  /** Number of place/transition positions actually changed by the run. */
  commitCount: number;
};

/**
 * Composite operations the host can invoke. These wrap multiple atomic
 * mutations in a single `mutate(...)` so they produce one Automerge change
 * (and one undo entry).
 *
 * Commands are intentionally NOT part of `instance.mutations` — the AI tool
 * bundle is derived from `mutationActionInputSchemas` and never auto-exposes
 * commands. AI-callable commands must be added explicitly to
 * `aiCommandActionInputSchemas` and routed through the AI dispatcher.
 */
export type CommandHelperFunctions = {
  /**
   * Paste a clipboard payload into the document, generating fresh IDs for
   * each item and deduplicating names. Returns the IDs of the newly created
   * items so the caller can update selection.
   */
  applyClipboardPaste: (input: {
    payload: ClipboardPayload;
  }) => ApplyClipboardPasteResult;

  /**
   * Reposition every place and transition using the ELK layered layout. Runs
   * unconditionally — the caller is responsible for confirming with the user
   * when applicable (e.g. the AI dispatcher prompts via an interactive chat
   * widget when `askUserFirst: true`).
   */
  applyAutoLayout: () => Promise<ApplyAutoLayoutResult>;
};

const validateNewlyPastedItems = (
  sdcpn: SDCPN,
  newItemIds: Array<{ type: string; id: string }>,
): void => {
  const idsByType = new Map<string, Set<string>>();
  for (const item of newItemIds) {
    let bucket = idsByType.get(item.type);
    if (!bucket) {
      bucket = new Set();
      idsByType.set(item.type, bucket);
    }
    bucket.add(item.id);
  }

  const placeIds = idsByType.get("place");
  if (placeIds) {
    for (const place of sdcpn.places) {
      if (placeIds.has(place.id)) {
        placeSchema.parse(place);
      }
    }
  }

  const transitionIds = idsByType.get("transition");
  if (transitionIds) {
    for (const transition of sdcpn.transitions) {
      if (transitionIds.has(transition.id)) {
        transitionSchema.parse(transition);
      }
    }
  }

  const typeIds = idsByType.get("type");
  if (typeIds) {
    for (const type of sdcpn.types) {
      if (typeIds.has(type.id)) {
        colorSchema.parse(type);
      }
    }
  }

  const equationIds = idsByType.get("differentialEquation");
  if (equationIds) {
    for (const equation of sdcpn.differentialEquations) {
      if (equationIds.has(equation.id)) {
        differentialEquationSchema.parse(equation);
      }
    }
  }

  const parameterIds = idsByType.get("parameter");
  if (parameterIds) {
    for (const parameter of sdcpn.parameters) {
      if (parameterIds.has(parameter.id)) {
        parameterSchema.parse(parameter);
      }
    }
  }
};

export function createPetrinautCommands(
  mutate: (fn: (sdcpn: SDCPN) => void) => void,
  read: () => SDCPN,
): CommandHelperFunctions {
  return {
    applyClipboardPaste(input) {
      const { payload } =
        commandActionInputSchemas.applyClipboardPaste.parse(input);
      let newItemIds: Array<{ type: string; id: string }> = [];
      mutate((sdcpn) => {
        const result = pastePayloadIntoSDCPN(sdcpn, payload);
        newItemIds = result.newItemIds;
        validateNewlyPastedItems(sdcpn, newItemIds);
      });
      return { newItemIds };
    },

    async applyAutoLayout() {
      const sdcpn = read();

      if (sdcpn.places.length === 0 && sdcpn.transitions.length === 0) {
        return { commitCount: 0 };
      }

      const positions = await calculateGraphLayout(sdcpn, layoutNodeDimensions);

      let commitCount = 0;
      mutate((draft) => {
        for (const place of draft.places) {
          const next = positions[place.id];
          if (next && (place.x !== next.x || place.y !== next.y)) {
            place.x = next.x;
            place.y = next.y;
            commitCount += 1;
          }
        }
        for (const transition of draft.transitions) {
          const next = positions[transition.id];
          if (next && (transition.x !== next.x || transition.y !== next.y)) {
            transition.x = next.x;
            transition.y = next.y;
            commitCount += 1;
          }
        }
      });

      return { commitCount };
    },
  };
}

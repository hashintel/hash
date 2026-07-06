import {
  colorSchema,
  differentialEquationSchema,
  parameterSchema,
  placeSchema,
  transitionSchema,
} from "./action-schemas";
import { pastePayloadIntoSDCPN } from "./clipboard/paste";
import { commandActionInputSchemas } from "./command-schemas";
import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  isSelectionTypeAvailableForExtensions,
  stripDisabledExtensionData,
  type PetrinautExtensionSettings,
} from "./extensions";
import { calculateGraphLayout } from "./layout/calculate-graph-layout";
import { layoutNodeDimensions } from "./layout/dimensions";

import type { ClipboardPayload } from "./clipboard/types";
import type { SDCPN, Subnet } from "./types/sdcpn";

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
    targetSubnetId?: string | null;
  }) => ApplyClipboardPasteResult;

  /**
   * Reposition every place and transition using the ELK layered layout. Runs
   * unconditionally — the caller is responsible for confirming with the user
   * when applicable (e.g. the AI dispatcher prompts via an interactive chat
   * widget when `askUserFirst: true`).
   */
  applyAutoLayout: (input?: {
    targetSubnetId?: string | null;
  }) => Promise<ApplyAutoLayoutResult>;
};

const resolveTargetNet = (
  sdcpn: SDCPN,
  targetSubnetId?: string | null,
): SDCPN | Subnet => {
  if (!targetSubnetId) {
    return sdcpn;
  }

  const subnet = sdcpn.subnets?.find(({ id }) => id === targetSubnetId);
  if (!subnet) {
    throw new Error(`Subnet with ID \`${targetSubnetId}\` does not exist.`);
  }

  return subnet;
};

const validateNewlyPastedItems = (
  sdcpn: SDCPN | Subnet,
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
  extensions: PetrinautExtensionSettings = DEFAULT_PETRINAUT_EXTENSIONS,
): CommandHelperFunctions {
  return {
    applyClipboardPaste(input) {
      const { payload, targetSubnetId } =
        commandActionInputSchemas.applyClipboardPaste.parse(input);
      let newItemIds: Array<{ type: string; id: string }> = [];
      mutate((sdcpn) => {
        const targetNet = resolveTargetNet(sdcpn, targetSubnetId);
        const result = pastePayloadIntoSDCPN(targetNet, payload);
        stripDisabledExtensionData(sdcpn, extensions);
        newItemIds = result.newItemIds.filter((item) =>
          isSelectionTypeAvailableForExtensions(item.type, extensions),
        );
        validateNewlyPastedItems(targetNet, newItemIds);
      });
      return { newItemIds };
    },

    async applyAutoLayout(input) {
      const sdcpn = read();
      const targetSubnetId = input?.targetSubnetId ?? null;
      const targetNet = resolveTargetNet(sdcpn, targetSubnetId);
      const componentInstances = targetNet.componentInstances ?? [];

      if (
        targetNet.places.length === 0 &&
        targetNet.transitions.length === 0 &&
        componentInstances.length === 0
      ) {
        return { commitCount: 0 };
      }

      const positions = await calculateGraphLayout(
        targetNet,
        layoutNodeDimensions,
      );

      let commitCount = 0;
      mutate((draft) => {
        const draftTargetNet = resolveTargetNet(draft, targetSubnetId);

        for (const place of draftTargetNet.places) {
          const next = positions[place.id];
          if (next && (place.x !== next.x || place.y !== next.y)) {
            place.x = next.x;
            place.y = next.y;
            commitCount += 1;
          }
        }
        for (const transition of draftTargetNet.transitions) {
          const next = positions[transition.id];
          if (next && (transition.x !== next.x || transition.y !== next.y)) {
            transition.x = next.x;
            transition.y = next.y;
            commitCount += 1;
          }
        }
        for (const instance of draftTargetNet.componentInstances ?? []) {
          const next = positions[instance.id];
          if (next && (instance.x !== next.x || instance.y !== next.y)) {
            instance.x = next.x;
            instance.y = next.y;
            commitCount += 1;
          }
        }
      });

      return { commitCount };
    },
  };
}

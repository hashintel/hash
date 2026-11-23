import { createContext, use } from "react";

import { SDCPNContext } from "../document/sdcpn-context";
import { SimulationContext, type SimulationState } from "../simulation/context";
import { EditorContext } from "../state/editor-context";
import { simulateModeAllowedMutationNames } from "./simulate-mode-allowed-mutation-names";

import type { EditorGlobalMode } from "../navigation/navigation";
import type { PetrinautMutations } from "@hashintel/petrinaut-core";

/**
 * Why the editor currently disallows mutations, or `null` when mutations
 * are allowed.
 *
 * - `host-readonly`: the consumer passed `readonly`, or the handle is read-only.
 * - `simulate-mode`: the user has switched to simulate mode.
 * - `actual-mode`: the user is viewing a host-provided live execution stream.
 * - `simulation-active`: a simulation is Running, Paused, or Complete.
 */
export type ReadOnlyReason =
  | { kind: "host-readonly" }
  | { kind: "simulate-mode" }
  | { kind: "actual-mode" }
  | { kind: "simulation-active"; state: "Running" | "Paused" | "Complete" };

/** The reason for what the document, the editor and the simulation say. */
export const readOnlyReasonOf = ({
  readonly,
  globalMode,
  simulationState,
}: {
  readonly: boolean;
  globalMode: EditorGlobalMode;
  simulationState: SimulationState;
}): ReadOnlyReason | null => {
  if (readonly) {
    return { kind: "host-readonly" };
  }
  if (globalMode === "simulate") {
    return { kind: "simulate-mode" };
  }
  if (globalMode === "actual") {
    return { kind: "actual-mode" };
  }
  if (
    simulationState === "Running" ||
    simulationState === "Paused" ||
    simulationState === "Complete"
  ) {
    return { kind: "simulation-active", state: simulationState };
  }
  return null;
};

/**
 * The reason as `ReadOnlyReasonProvider` gives it out, or `undefined` where
 * there is no such provider above.
 */
export const ReadOnlyReasonContext = createContext<
  ReadOnlyReason | null | undefined
>(undefined);

/**
 * Single source of truth for "is the document currently writable" plus a
 * structured reason for refusal. UI consumers that only need a boolean can
 * use {@link useIsReadOnly}, which collapses this to `reason !== null`.
 *
 * Almost every component that edits asks this. It has a context of its own
 * so that they render when the reason changes, and not with every change of
 * the editor context, which a panel that opens or a selection makes. It is a
 * context and not a selector on the editor context because a guard has to
 * hold in the commit that changes the mode: a layout effect of that commit
 * that edits the document is refused.
 */
export const useReadOnlyReason = (): ReadOnlyReason | null => {
  const provided = use(ReadOnlyReasonContext);
  // No provider above: a test or a story that provides the three contexts on
  // their own. `use` is the one hook that may sit in a condition.
  return provided === undefined
    ? readOnlyReasonOf({
        readonly: use(SDCPNContext).readonly,
        globalMode: use(EditorContext).globalMode,
        simulationState: use(SimulationContext).state,
      })
    : provided;
};

/**
 * Human-readable explanation for a refusal — used to surface refusal
 * feedback to the AI tool dispatcher.
 */
export const formatReadOnlyReason = (reason: ReadOnlyReason): string => {
  switch (reason.kind) {
    case "host-readonly":
      return "This document is read-only; mutations are disabled.";
    case "simulate-mode":
      return "The editor is in simulate mode. Ask the user to switch to edit mode before mutating.";
    case "actual-mode":
      return "The editor is in actual mode. Ask the user to switch to edit mode before mutating.";
    case "simulation-active":
      return `A simulation is currently ${reason.state.toLowerCase()}. Ask the user to reset the simulation before mutating.`;
  }
};

const onlyUpdatesVisualizer = (input: unknown): boolean => {
  if (!input || typeof input !== "object" || !("update" in input)) return false;
  const { update } = input;
  return (
    update !== null &&
    typeof update === "object" &&
    Object.keys(update).length === 1 &&
    Object.hasOwn(update, "visualizerCode")
  );
};

/** Visualizers, scenarios and metrics do not change an active simulation. */
export const mutationBlockedBy = (
  name: keyof PetrinautMutations,
  reason: ReadOnlyReason | null,
  input?: unknown,
): ReadOnlyReason | null => {
  if (reason === null || reason.kind === "host-readonly") return reason;
  return simulateModeAllowedMutationNames.has(name) ||
    (name === "updatePlace" && onlyUpdatesVisualizer(input))
    ? null
    : reason;
};

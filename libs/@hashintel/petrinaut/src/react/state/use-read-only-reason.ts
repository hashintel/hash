import { use } from "react";

import { SimulationContext } from "../simulation/context";
import { EditorContext } from "./editor-context";
import { SDCPNContext } from "./sdcpn-context";
import { simulateModeAllowedMutationNames } from "./simulate-mode-allowed-mutation-names";

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

/**
 * Single source of truth for "is the document currently writable" plus a
 * structured reason for refusal. UI consumers that only need a boolean can
 * use {@link useIsReadOnly}, which collapses this to `reason !== null`.
 */
export const useReadOnlyReason = (): ReadOnlyReason | null => {
  const { readonly } = use(SDCPNContext);
  const { globalMode } = use(EditorContext);
  const { state: simulationState } = use(SimulationContext);

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

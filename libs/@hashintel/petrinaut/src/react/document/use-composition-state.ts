import { use } from "react";

import {
  firstInstancePathOf,
  indexCompositionState,
  type Component,
  type CompositionStateIndex,
  type PetrinautExtensionSettings,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { ActiveNetContext } from "./active-net-context";
import { SDCPNContext } from "./sdcpn-context";
import { useExecutableDefinition } from "./use-executable-definition";

const indexByDefinition = new WeakMap<
  SDCPN,
  { extensions: PetrinautExtensionSettings; index: CompositionStateIndex }
>();

/**
 * Where a run keeps the state of each net of the composition: the flat place
 * behind a place of a component instance, and the parameter values an
 * instance runs with. Read off the net the simulator is given, once per
 * document and set of extensions.
 */
export const useCompositionStateIndex = (): CompositionStateIndex => {
  const definition = useExecutableDefinition();
  const { extensions } = use(SDCPNContext);
  const known = indexByDefinition.get(definition);
  if (known?.extensions === extensions) {
    return known.index;
  }
  const index = indexCompositionState(definition, extensions);
  indexByDefinition.set(definition, { extensions, index });
  return index;
};

const pathsByDefinition = new WeakMap<
  SDCPN,
  Map<string, readonly string[] | null>
>();

const noPath: readonly string[] = [];

/**
 * The instances that lead from the root net to the state the open net shows.
 * The root net shows its own: an empty path. A component shows the state of
 * its instance nearest the root net, and `null` while nothing instantiates
 * it: a component is a definition, and holds tokens only where it is placed.
 */
export const useOpenNetStatePath = (): readonly string[] | null => {
  const definition = useExecutableDefinition();
  const { activeComponentId } = use(ActiveNetContext);
  if (activeComponentId === null) {
    return noPath;
  }
  let paths = pathsByDefinition.get(definition);
  if (!paths) {
    paths = new Map();
    pathsByDefinition.set(definition, paths);
  }
  if (!paths.has(activeComponentId)) {
    paths.set(
      activeComponentId,
      firstInstancePathOf(definition, activeComponentId),
    );
  }
  return paths.get(activeComponentId) ?? null;
};

/**
 * The open net as the simulator is given it: the root net, or the open
 * component. `null` when the open component is not in the document.
 */
export const useOpenExecutableNet = (): SDCPN | Component | null => {
  const definition = useExecutableDefinition();
  const { activeComponentId } = use(ActiveNetContext);
  if (activeComponentId === null) {
    return definition;
  }
  return (
    definition.components?.find(({ id }) => id === activeComponentId) ?? null
  );
};

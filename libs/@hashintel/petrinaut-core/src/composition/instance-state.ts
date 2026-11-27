/**
 * Where a run keeps the state of each net of a composition.
 *
 * A run flattens the document: a place of a component instance becomes a
 * flat place under the path of instances that leads to it, and a fusion
 * merges its members into one place. This reads that mapping off the
 * document, so the state of one instance can be shown: the tokens of its
 * places and the parameter values it runs with.
 */
import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  sanitizeSDCPNForExtensions,
  type PetrinautExtensionSettings,
} from "../extensions/extensions";
import {
  flattenComponentInstancesForSimulation,
  instancePathKey,
} from "./flatten-component-instances";
import { indexDocument, resolveImplementation } from "./interfaces";
import { scopedId } from "./scoped-id";

import type { ParameterValues } from "../simulation/engine/types";
import type { Component, ID, SDCPN } from "../types/sdcpn";

export type CompositionStateIndex = {
  /**
   * The flat place of a run that holds the tokens of `placeId`, a place of
   * the net the instances of `path` lead to: the root net for an empty path.
   * A fused place is the one flat place its fusion leaves.
   */
  flatPlaceId: (path: readonly ID[], placeId: ID) => ID;
  /**
   * The parameter values the instance at `path` runs with, by variable name.
   * `null` for the root net, which runs with the run's own values, and for a
   * path that leads to no instance.
   */
  instanceParameterValues: (path: readonly ID[]) => ParameterValues | null;
};

/**
 * Reads where a run of `sdcpn` keeps each place, as the run itself does:
 * give it the net the simulator is given, its imports inlined. A composition
 * that does not flatten does not run either: its places then read as their
 * own, unfused.
 */
export const indexCompositionState = (
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings = DEFAULT_PETRINAUT_EXTENSIONS,
): CompositionStateIndex => {
  let fusedPlaceAliases: ReadonlyMap<ID, ID> = new Map();
  let parameterValuesByPath: ReadonlyMap<string, ParameterValues> = new Map();
  try {
    const flattened = flattenComponentInstancesForSimulation({
      sdcpn: sanitizeSDCPNForExtensions(sdcpn, extensions),
      initialMarking: {},
      rootParameterValues: {},
      parametersEnabled: extensions.parameters,
    });
    fusedPlaceAliases = flattened.fusedPlaceAliases;
    parameterValuesByPath = flattened.instanceParameterValues;
  } catch {
    // Reported by the composition checks, which name what is wrong.
  }
  return {
    flatPlaceId: (path, placeId) => {
      const id = scopedId(path, placeId);
      return fusedPlaceAliases.get(id) ?? id;
    },
    instanceParameterValues: (path) =>
      parameterValuesByPath.get(instancePathKey(path)) ?? null,
  };
};

/**
 * The component the instance `instanceId` of `net` runs: its own, or the
 * implementation bound to the interface it points at. `null` when `net` has
 * no such instance or nothing runs for it.
 */
export const runningComponentOf = (
  sdcpn: SDCPN,
  net: SDCPN | Component,
  instanceId: ID,
  index = indexDocument(sdcpn),
): Component | null => {
  const instance = net.componentInstances?.find(({ id }) => id === instanceId);
  const binding = instance
    ? resolveImplementation(sdcpn, instance, undefined, index)
    : null;
  if (binding === null || binding.kind === "unbound") {
    return null;
  }
  return binding.kind === "component"
    ? binding.component
    : binding.implementation;
};

/**
 * The net the instances of `path` lead to from the root net, as it runs: the
 * root net for an empty path, the component the last instance runs
 * otherwise. `null` when an instance of the path does not exist or runs
 * nothing.
 */
export const netAtInstancePath = (
  sdcpn: SDCPN,
  path: readonly ID[],
): SDCPN | Component | null => {
  const index = indexDocument(sdcpn);
  let net: SDCPN | Component = sdcpn;
  for (const instanceId of path) {
    const running = runningComponentOf(sdcpn, net, instanceId, index);
    if (running === null) {
      return null;
    }
    net = running;
  }
  return net;
};

/**
 * The path of instance ids from the root net to an instance that runs the
 * component `componentId`: the nearest to the root, the first in document
 * order among those. `null` when no instance of the composition runs it.
 */
export const firstInstancePathOf = (
  sdcpn: SDCPN,
  componentId: ID,
): ID[] | null => {
  const index = indexDocument(sdcpn);
  const queue: { net: SDCPN | Component; path: ID[]; entered: ID[] }[] = [
    { net: sdcpn, path: [], entered: [] },
  ];
  for (const { net, path, entered } of queue) {
    for (const instance of net.componentInstances ?? []) {
      const running = runningComponentOf(sdcpn, net, instance.id, index);
      if (running === null) {
        continue;
      }
      const instancePath = [...path, instance.id];
      if (running.id === componentId) {
        return instancePath;
      }
      // A component that holds itself does not run: its cycle ends here.
      if (!entered.includes(running.id)) {
        queue.push({
          net: running,
          path: instancePath,
          entered: [...entered, running.id],
        });
      }
    }
  }
  return null;
};

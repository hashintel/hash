/**
 * Net identity helpers. A net id (a document's `PetrinautDocHandle.id`) and a
 * subnet id (`Subnet.id`, `ComponentInstance.subnetId`) is a lowercase UUID.
 * Ids in any other form are converted on load with {@link toNetId}, so the
 * same legacy id always names the same net.
 */

import { v4 as uuidv4, v5 as uuidv5 } from "uuid";

import { isUuidString } from "./simulation/engine/uuid";

import type { ComponentInstance, SDCPN, Subnet } from "./types/sdcpn";

/**
 * UUIDv5 namespace under which non-UUID ids are converted. This value MUST
 * NEVER change: converted ids are persisted in documents, URLs and host
 * storage, and a new namespace would silently remap every one of them.
 */
export const PETRINAUT_ID_NAMESPACE = "f346239e-b5e3-53b6-bb7e-297046d1ac64";

/** Whether `value` is a net id: a UUID string in lowercase. */
export const isNetId = (value: unknown): value is string =>
  isUuidString(value) && value === value.toLowerCase();

/**
 * Converts any id to a net id: a UUID is lowercased, anything else becomes
 * its UUIDv5 under {@link PETRINAUT_ID_NAMESPACE}. Deterministic and
 * idempotent.
 */
export const toNetId = (id: string): string =>
  isUuidString(id) ? id.toLowerCase() : uuidv5(id, PETRINAUT_ID_NAMESPACE);

/** A fresh random net id. */
export const generateNetId = (): string => uuidv4();

const mapUnlessUnchanged = <Item>(
  items: Item[],
  mapItem: (item: Item) => Item,
): Item[] => {
  const mapped = items.map(mapItem);
  return mapped.every((item, index) => item === items[index]) ? items : mapped;
};

const canonicalizeInstance = (
  instance: ComponentInstance,
): ComponentInstance => {
  const subnetId = toNetId(instance.subnetId);
  return subnetId === instance.subnetId ? instance : { ...instance, subnetId };
};

const canonicalizeInstances = <Net extends Pick<SDCPN, "componentInstances">>(
  net: Net,
): Net => {
  if (net.componentInstances === undefined) {
    return net;
  }
  const componentInstances = mapUnlessUnchanged(
    net.componentInstances,
    canonicalizeInstance,
  );
  return componentInstances === net.componentInstances
    ? net
    : { ...net, componentInstances };
};

const canonicalizeSubnet = (subnet: Subnet): Subnet => {
  const id = toNetId(subnet.id);
  const canonical = canonicalizeInstances(subnet);
  return id === subnet.id ? canonical : { ...canonical, id };
};

/**
 * Converts every subnet id in `sdcpn` to a net id: subnet definitions and the
 * component instances that reference them, at the root and inside subnets.
 * Returns `sdcpn` itself when every id is already canonical.
 */
export const canonicalizeNetIds = <Net extends SDCPN>(sdcpn: Net): Net => {
  const canonical = canonicalizeInstances(sdcpn);
  if (canonical.subnets === undefined) {
    return canonical;
  }
  const subnets = mapUnlessUnchanged(canonical.subnets, canonicalizeSubnet);
  return subnets === canonical.subnets ? canonical : { ...canonical, subnets };
};

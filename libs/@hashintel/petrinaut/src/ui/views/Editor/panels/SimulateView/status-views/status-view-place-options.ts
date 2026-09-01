import { formatScopedId } from "@hashintel/petrinaut-core";

import type { SDCPN } from "@hashintel/petrinaut-core";

export type StatusViewPlaceOption = {
  /** Place id as a status label references it: plain for root places,
   * scoped `instanceId::placeId` for a componentInstance's copies. */
  value: string;
  label: string;
};

/**
 * Every place a status label can reference: the root net's places, plus each
 * componentInstance's copies of its subnet's places under scoped ids
 * (`instanceId::placeId`, displayed as `InstanceName::PlaceName`). Nested
 * instances contribute doubly-scoped copies.
 */
export function getStatusViewPlaceOptions(
  sdcpn: SDCPN,
): StatusViewPlaceOption[] {
  const options: StatusViewPlaceOption[] = sdcpn.places.map((place) => ({
    value: place.id,
    label: place.name,
  }));

  const subnetById = new Map(
    (sdcpn.subnets ?? []).map((subnet) => [subnet.id, subnet]),
  );

  const visitInstances = (
    instances: NonNullable<SDCPN["componentInstances"]>,
    idPath: readonly string[],
    namePath: readonly string[],
  ): void => {
    for (const instance of instances) {
      const subnet = subnetById.get(instance.subnetId);
      if (!subnet) {
        continue;
      }
      const instanceIdPath = [...idPath, instance.id];
      const instanceNamePath = [...namePath, instance.name];
      for (const place of subnet.places) {
        options.push({
          value: formatScopedId(instanceIdPath, place.id),
          label: [...instanceNamePath, place.name].join("::"),
        });
      }
      visitInstances(
        subnet.componentInstances ?? [],
        instanceIdPath,
        instanceNamePath,
      );
    }
  };

  visitInstances(sdcpn.componentInstances ?? [], [], []);

  return options;
}

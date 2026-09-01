/**
 * The place universe status views evaluate against and resolve label
 * references in: the root net's places, plus each componentInstance's copies
 * of its subnet's places under scoped ids — the id space execution frames
 * key places by (see `scoped-ids.ts`).
 */

import {
  formatScopedId,
  parseScopedId,
  SCOPED_ID_SEPARATOR,
} from "./scoped-ids";

import type { Color, ID, Place, SDCPN } from "./types/sdcpn";

export type ScopedPlaceVisit = {
  /** The place id as status labels and execution frames reference it. */
  scopedId: ID;
  /** Component-instance names from outermost to innermost, for display. */
  instanceNamePath: readonly string[];
  /** The subnet place the componentInstance copies. */
  place: Place;
};

/**
 * Visits every componentInstance's copy of a subnet place, outermost
 * instances first, nested instances after their parent. An instance whose
 * subnet is missing, and any instance or place whose id already contains the
 * scope separator (such an id cannot be addressed by a scoped id), is
 * skipped.
 */
export const visitComponentInstancePlaces = (
  sdcpn: SDCPN,
  visit: (scopedPlace: ScopedPlaceVisit) => void,
): void => {
  const subnetById = new Map(
    (sdcpn.subnets ?? []).map((subnet) => [subnet.id, subnet]),
  );

  const visitInstances = (
    instances: NonNullable<SDCPN["componentInstances"]>,
    idPath: readonly ID[],
    namePath: readonly string[],
  ): void => {
    for (const instance of instances) {
      const subnet = subnetById.get(instance.subnetId);
      if (!subnet || instance.id.includes(SCOPED_ID_SEPARATOR)) {
        continue;
      }
      const instanceIdPath = [...idPath, instance.id];
      const instanceNamePath = [...namePath, instance.name];
      for (const place of subnet.places) {
        if (place.id.includes(SCOPED_ID_SEPARATOR)) {
          continue;
        }
        visit({
          scopedId: formatScopedId(instanceIdPath, place.id),
          instanceNamePath,
          place,
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
};

/**
 * The place and colour universe status views evaluate against: the root
 * net's places, plus each componentInstance's copies of its subnet's places
 * under scoped ids. Subnet colours keep their definition ids, matching the
 * copies' `colorId`.
 */
export const getStatusViewEvaluationScope = (
  sdcpn: SDCPN,
): { places: Place[]; types: Color[] } => {
  const places: Place[] = [...sdcpn.places];
  const types: Color[] = [
    ...sdcpn.types,
    ...(sdcpn.subnets ?? []).flatMap((subnet) => subnet.types),
  ];

  visitComponentInstancePlaces(sdcpn, ({ scopedId, place }) => {
    places.push({ ...place, id: scopedId });
  });

  return { places, types };
};

/**
 * Resolves a status label's place reference: a bare id names a root-net
 * place, and a scoped id (`instanceId::placeId`) names a componentInstance's
 * copy of a subnet place, following the instance path from the root.
 * Returns undefined for a reference that no longer resolves.
 */
export const resolveStatusViewLabelPlace = (
  sdcpn: SDCPN,
  labelPlaceId: ID,
): Place | undefined => {
  const { instancePath, entityId } = parseScopedId(labelPlaceId);
  if (instancePath.length === 0) {
    return sdcpn.places.find((place) => place.id === entityId);
  }

  const subnetById = new Map(
    (sdcpn.subnets ?? []).map((subnet) => [subnet.id, subnet]),
  );
  let instances = sdcpn.componentInstances ?? [];
  let subnet: NonNullable<SDCPN["subnets"]>[number] | undefined;
  for (const instanceId of instancePath) {
    const instance = instances.find((candidate) => candidate.id === instanceId);
    subnet = instance ? subnetById.get(instance.subnetId) : undefined;
    if (!subnet) {
      return undefined;
    }
    instances = subnet.componentInstances ?? [];
  }
  return subnet?.places.find((place) => place.id === entityId);
};

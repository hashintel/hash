import {
  SCOPED_ID_SEPARATOR,
  visitComponentInstancePlaces,
} from "@hashintel/petrinaut-core";

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

  visitComponentInstancePlaces(
    sdcpn,
    ({ scopedId, instanceNamePath, place }) => {
      options.push({
        value: scopedId,
        label: [...instanceNamePath, place.name].join(SCOPED_ID_SEPARATOR),
      });
    },
  );

  return options;
}

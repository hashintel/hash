import type {
  Color,
  Place,
  SDCPN,
  Transition,
} from "../../../core/types/sdcpn";

type SDCPNWithoutVisualInfo = Omit<
  SDCPN,
  "places" | "transitions" | "types"
> & {
  places: Array<Omit<Place, "x" | "y">>;
  transitions: Array<Omit<Transition, "x" | "y">>;
  types: Array<Omit<Color, "displayColor" | "iconSlug">>;
};

/**
 * Removes graphical information from an SDCPN.
 * @param sdcpn - The SDCPN to process
 * @returns A new SDCPN-like object without graphical positioning information
 */
export function removeVisualInformation(sdcpn: SDCPN): SDCPNWithoutVisualInfo {
  return {
    ...sdcpn,
    places: sdcpn.places.map(({ x: _x, y: _y, ...place }) => place),
    transitions: sdcpn.transitions.map(
      ({ x: _x, y: _y, ...transition }) => transition,
    ),
    types: sdcpn.types.map(
      ({ displayColor: _displayColor, iconSlug: _iconSlug, ...type }) => type,
    ),
  };
}

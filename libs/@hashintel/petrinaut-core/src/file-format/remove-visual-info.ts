import type {
  Color,
  Component,
  ComponentInstance,
  Place,
  SDCPN,
  Transition,
} from "../types/sdcpn";

type NetWithoutVisualInfo<Net extends SDCPN | Component> = Omit<
  Net,
  "places" | "transitions" | "types" | "componentInstances" | "components"
> & {
  places: Array<Omit<Place, "x" | "y">>;
  transitions: Array<Omit<Transition, "x" | "y">>;
  types: Array<Omit<Color, "displayColor" | "iconSlug">>;
  componentInstances: Array<Omit<ComponentInstance, "x" | "y">>;
};

type ComponentWithoutVisualInfo = Omit<
  NetWithoutVisualInfo<Component>,
  "iconSvg" | "displayColor"
>;
type SDCPNWithoutVisualInfo = NetWithoutVisualInfo<SDCPN> & {
  components: ComponentWithoutVisualInfo[];
};

const stripVisualFromNet = <Net extends SDCPN | Component>(
  net: Net,
): NetWithoutVisualInfo<Net> => ({
  ...net,
  places: net.places.map(({ x: _x, y: _y, ...place }) => place),
  transitions: net.transitions.map(
    ({ x: _x, y: _y, ...transition }) => transition,
  ),
  types: net.types.map(
    ({ displayColor: _displayColor, iconSlug: _iconSlug, ...type }) => type,
  ),
  componentInstances: (net.componentInstances ?? []).map(
    ({ x: _x, y: _y, ...instance }) => instance,
  ),
});

/**
 * Removes graphical information from an SDCPN.
 * @param sdcpn - The SDCPN to process
 * @returns A new SDCPN-like object without graphical positioning information
 */
export function removeVisualInformation(sdcpn: SDCPN): SDCPNWithoutVisualInfo {
  return {
    ...stripVisualFromNet(sdcpn),
    components: (sdcpn.components ?? []).map(
      ({ iconSvg: _iconSvg, displayColor: _displayColor, ...component }) =>
        stripVisualFromNet(component),
    ),
  };
}

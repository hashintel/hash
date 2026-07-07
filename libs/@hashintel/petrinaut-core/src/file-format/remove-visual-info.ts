import type {
  Color,
  ComponentInstance,
  Place,
  SDCPN,
  Subnet,
  Transition,
} from "../types/sdcpn";

type NetWithoutVisualInfo<Net extends SDCPN | Subnet> = Omit<
  Net,
  "places" | "transitions" | "types" | "componentInstances" | "subnets"
> & {
  places: Array<Omit<Place, "x" | "y">>;
  transitions: Array<Omit<Transition, "x" | "y">>;
  types: Array<Omit<Color, "displayColor" | "iconSlug">>;
  componentInstances: Array<Omit<ComponentInstance, "x" | "y">>;
};

type SubnetWithoutVisualInfo = NetWithoutVisualInfo<Subnet>;
type SDCPNWithoutVisualInfo = NetWithoutVisualInfo<SDCPN> & {
  subnets: SubnetWithoutVisualInfo[];
};

const stripVisualFromNet = <Net extends SDCPN | Subnet>(
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
    subnets: (sdcpn.subnets ?? []).map((subnet) => stripVisualFromNet(subnet)),
  };
}

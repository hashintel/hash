import type {
  Color,
  ComponentInstance,
  Place,
  SDCPN,
  Subnet,
  Transition,
} from "../core/types/sdcpn";

type NetWithoutVisualInfo = {
  places: Array<Omit<Place, "x" | "y">>;
  transitions: Array<Omit<Transition, "x" | "y">>;
  types: Array<Omit<Color, "displayColor" | "iconSlug">>;
  componentInstances: Array<Omit<ComponentInstance, "x" | "y">>;
};

type SubnetWithoutVisualInfo = Omit<
  Subnet,
  "places" | "transitions" | "types" | "componentInstances"
> &
  NetWithoutVisualInfo;

type SDCPNWithoutVisualInfo = Omit<
  SDCPN,
  "places" | "transitions" | "types" | "componentInstances" | "subnets"
> &
  NetWithoutVisualInfo & {
    subnets: SubnetWithoutVisualInfo[];
  };

const stripVisualFromNodes = (nodes: {
  places: Place[];
  transitions: Transition[];
  types: Color[];
  componentInstances?: ComponentInstance[];
}) => ({
  places: nodes.places.map(({ x: _x, y: _y, ...place }) => place),
  transitions: nodes.transitions.map(
    ({ x: _x, y: _y, ...transition }) => transition,
  ),
  types: nodes.types.map(
    ({ displayColor: _displayColor, iconSlug: _iconSlug, ...type }) => type,
  ),
  componentInstances: (nodes.componentInstances ?? []).map(
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
    ...sdcpn,
    ...stripVisualFromNodes(sdcpn),
    subnets: (sdcpn.subnets ?? []).map((subnet) => ({
      ...subnet,
      ...stripVisualFromNodes(subnet),
    })),
  };
}

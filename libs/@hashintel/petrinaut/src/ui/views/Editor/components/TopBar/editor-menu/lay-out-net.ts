import {
  calculateGraphLayout,
  layoutNodeDimensions,
  type SDCPN,
} from "@hashintel/petrinaut-core";

/** The net with each place and transition where the automatic layout puts it. */
export const layOutNet = async <Net extends SDCPN>(net: Net): Promise<Net> => {
  const positions = await calculateGraphLayout(net, layoutNodeDimensions);
  const placed = <Node extends { id: string }>(node: Node): Node => {
    const position = positions[node.id];
    return position ? { ...node, x: position.x, y: position.y } : node;
  };

  return {
    ...net,
    places: net.places.map(placed),
    transitions: net.transitions.map(placed),
  };
};

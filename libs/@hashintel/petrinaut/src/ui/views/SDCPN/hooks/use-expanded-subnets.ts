import { useState } from "react";

import {
  calculateGraphLayout,
  layoutNodeDimensions,
  type ComponentInstance,
  type SDCPN,
  type Subnet,
} from "@hashintel/petrinaut-core";

/**
 * Prototype for FE-874 — expanding a component instance (subnet box) in place.
 *
 * Expansion is a **view-layer** concept: the SDCPN store is never mutated.
 * When an instance is expanded we:
 *   1. run ELK layout over the referenced subnet's internal net,
 *   2. render the instance as a large "frame" node whose children (the
 *      subnet's places/transitions) are React Flow child nodes (`parentId`),
 *   3. displace the *displayed* positions of the surrounding nodes so the
 *      frame has room — stored x/y positions in the model stay untouched.
 *
 * The displayed position of every node is `model position + expansion shift`
 * (see {@link computeExpansionShift}); committing a drag applies the inverse.
 */

/**
 * Separator used to build React Flow node/edge ids for elements rendered
 * inside an expanded instance. Ids must be namespaced by instance id because
 * two instances of the same subnet would otherwise produce colliding ids.
 */
const EXPANDED_CHILD_ID_SEPARATOR = "::";

export const makeExpandedChildId = (
  instanceId: string,
  childId: string,
): string => `${instanceId}${EXPANDED_CHILD_ID_SEPARATOR}${childId}`;

/** Whether a React Flow node/edge id refers to an element inside an expanded instance. */
export const isExpandedChildId = (id: string): boolean =>
  id.includes(EXPANDED_CHILD_ID_SEPARATOR);

/** Height of the title bar rendered at the top of an expanded instance frame. */
export const EXPANDED_FRAME_HEADER_HEIGHT = 40;

/** Padding around the subnet content inside the frame (matches ELK's graph padding). */
const EXPANDED_FRAME_PADDING = 30;

/**
 * Height of a collapsed component instance box, which grows with its port
 * count. Must match the rendering in `use-sdcpn-to-react-flow.ts`.
 */
export const collapsedInstanceHeight = (
  minHeight: number,
  portCount: number,
): number => Math.max(minHeight, portCount * 28 + 28);

export type ExpandedSubnetLayout = {
  /**
   * Center positions of the subnet's internal nodes, relative to the
   * top-left corner of the expanded frame (header offset already applied).
   */
  positionsByNodeId: Record<string, { x: number; y: number }>;
  /** Total size of the expanded frame node. */
  width: number;
  height: number;
};

export type ExpandedSubnetsByInstanceId = Record<string, ExpandedSubnetLayout>;

/**
 * A single expanded instance's contribution to the display-time displacement
 * of the rest of the net. Expansion grows symmetrically around the instance's
 * stored center, pushing surrounding nodes away on each axis.
 */
export type ExpansionDisplacementSource = {
  instanceId: string;
  /** Stored (model) center of the instance. */
  centerX: number;
  centerY: number;
  /** How much bigger the expanded frame is than the collapsed box. */
  deltaWidth: number;
  deltaHeight: number;
};

/**
 * Shift applied to a node's *stored* position to obtain its *displayed*
 * position, given the currently expanded instances.
 *
 * The rule is an "insert space" displacement: every expanded instance pushes
 * nodes strictly to its right further right by half its width growth (and
 * symmetrically to the left / above / below). It is deterministic and
 * invertible from the node's stored position, which lets drag commits map
 * displayed coordinates back to stored coordinates.
 */
export function computeExpansionShift(
  sources: ExpansionDisplacementSource[],
  nodeId: string,
  modelPosition: { x: number; y: number },
): { dx: number; dy: number } {
  let dx = 0;
  let dy = 0;
  for (const source of sources) {
    if (source.instanceId === nodeId) {
      // An instance is never displaced by its own expansion — it grows
      // symmetrically around its stored center.
      continue;
    }
    if (modelPosition.x > source.centerX) {
      dx += source.deltaWidth / 2;
    } else if (modelPosition.x < source.centerX) {
      dx -= source.deltaWidth / 2;
    }
    if (modelPosition.y > source.centerY) {
      dy += source.deltaHeight / 2;
    } else if (modelPosition.y < source.centerY) {
      dy -= source.deltaHeight / 2;
    }
  }
  return { dx, dy };
}

/**
 * Builds the displacement sources for the currently expanded instances of the
 * active net. `collapsedDimensions` are the rendering dimensions of a
 * collapsed component instance box.
 */
export function computeDisplacementSources(
  componentInstances: ComponentInstance[],
  subnets: Subnet[],
  expandedSubnets: ExpandedSubnetsByInstanceId,
  collapsedDimensions: { width: number; height: number },
): ExpansionDisplacementSource[] {
  const sources: ExpansionDisplacementSource[] = [];
  for (const instance of componentInstances) {
    const layout = expandedSubnets[instance.id];
    if (!layout) {
      continue;
    }
    const subnet = subnets.find(({ id }) => id === instance.subnetId);
    const portCount =
      subnet?.places.filter((place) => place.isPort).length ?? 0;
    const collapsedHeight = collapsedInstanceHeight(
      collapsedDimensions.height,
      portCount,
    );
    sources.push({
      instanceId: instance.id,
      centerX: instance.x,
      centerY: instance.y,
      deltaWidth: Math.max(0, layout.width - collapsedDimensions.width),
      deltaHeight: Math.max(0, layout.height - collapsedHeight),
    });
  }
  return sources;
}

const dimensionsForSubnetNode = (
  subnet: Subnet,
  nodeId: string,
): { width: number; height: number } => {
  if (subnet.places.some(({ id }) => id === nodeId)) {
    return layoutNodeDimensions.place;
  }
  if ((subnet.componentInstances ?? []).some(({ id }) => id === nodeId)) {
    return (
      layoutNodeDimensions.componentInstance ?? layoutNodeDimensions.transition
    );
  }
  return layoutNodeDimensions.transition;
};

/**
 * Holds which component instances are currently expanded in place, along with
 * the ELK-computed layout of their subnet content. Purely view state.
 */
export function useExpandedSubnets() {
  const [expandedSubnets, setExpandedSubnets] =
    useState<ExpandedSubnetsByInstanceId>({});

  async function expandInstance(instanceId: string, subnet: Subnet) {
    // The subnet is a full nested net definition; ELK layout only reads
    // places / transitions / componentInstances from it.
    const layoutInput: SDCPN = { ...subnet, subnets: [] };
    const rawPositions = await calculateGraphLayout(
      layoutInput,
      layoutNodeDimensions,
    );

    // ELK output uses center coordinates with `EXPANDED_FRAME_PADDING`
    // already applied on the top/left. Compute the frame size from the
    // content bounds and shift content down to make room for the header.
    let maxRight = 0;
    let maxBottom = 0;
    const positionsByNodeId: ExpandedSubnetLayout["positionsByNodeId"] = {};
    for (const [nodeId, position] of Object.entries(rawPositions)) {
      const { width, height } = dimensionsForSubnetNode(subnet, nodeId);
      maxRight = Math.max(maxRight, position.x + width / 2);
      maxBottom = Math.max(maxBottom, position.y + height / 2);
      positionsByNodeId[nodeId] = {
        x: position.x,
        y: position.y + EXPANDED_FRAME_HEADER_HEIGHT,
      };
    }

    const width = Math.max(maxRight + EXPANDED_FRAME_PADDING, 240);
    const height = Math.max(
      maxBottom + EXPANDED_FRAME_PADDING + EXPANDED_FRAME_HEADER_HEIGHT,
      120,
    );

    setExpandedSubnets((existing) => ({
      ...existing,
      [instanceId]: { positionsByNodeId, width, height },
    }));
  }

  function collapseInstance(instanceId: string) {
    setExpandedSubnets((existing) => {
      if (!(instanceId in existing)) {
        return existing;
      }
      const { [instanceId]: _, ...rest } = existing;
      return rest;
    });
  }

  function resetExpandedSubnets() {
    setExpandedSubnets({});
  }

  return {
    expandedSubnets,
    expandInstance,
    collapseInstance,
    resetExpandedSubnets,
  };
}

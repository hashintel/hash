/**
 * Force layout for individual entities inside an opened leaf cluster.
 *
 * Entities should fill their bubble compactly: weak charge, collision spacing,
 * a gentle spring toward the center, and hard confinement to the bubble. Link
 * springs pull connected entities together. This is deliberately not the
 * cluster layout: bubbles need to spread and route edges; dots need to pack.
 *
 * On top of that, a port-attraction force pulls each entity toward the live rim
 * point where its external edge attaches (its port target), instead of a
 * pre-baked exit fan: the dots cluster near their real exits, so the fan-out
 * lines stay short and legible. The target array is shared with (and updated
 * live by) the worker, so as ports re-slot the dots follow, with no baked,
 * going-stale positions.
 *
 * The port pull does not fully win: the gentle center spring stays on for every
 * dot, so a targeted dot settles a bit inside the rim (a blend of port + centre)
 * rather than jammed against it, which keeps dots legible and lets a dot with
 * several external ports sit sensibly between them instead of being torn to one.
 */
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from "d3-force";

import { defaultEntityForceConfig } from "./entity-layout-config";
import { ForceSimulation } from "./force-simulation";

import type { EntityForceConfig } from "./entity-layout-config";
import type { ForceEdge, ForceNode } from "./force-simulation";
import type { Force } from "d3-force";

/**
 * Pull each entity toward its port target `(targets[2i], targets[2i+1])`, in the
 * leaf's local frame. A NaN target means "no external connection", so that
 * entity is left to the center/charge forces. `targets` is owned by the worker and
 * mutated in place as ports re-slot; this force reads it live each tick.
 */
function forcePortAttraction(
  targets: Float32Array,
  strength: number,
): Force<ForceNode, undefined> {
  let nodes: ForceNode[] = [];

  const force: Force<ForceNode, undefined> = (alpha) => {
    for (let idx = 0; idx < nodes.length; idx++) {
      const tx = targets[idx * 2]!;
      if (Number.isNaN(tx)) {
        continue;
      }
      const ty = targets[idx * 2 + 1]!;
      const node = nodes[idx]!;
      node.vx = (node.vx ?? 0) + (tx - (node.x ?? 0)) * strength * alpha;
      node.vy = (node.vy ?? 0) + (ty - (node.y ?? 0)) * strength * alpha;
    }
  };

  force.initialize = (newNodes: ForceNode[]) => {
    nodes = newNodes;
  };

  return force;
}

/**
 * Builds a confined d3-force simulation for leaf-cluster entities with
 * optional live port-target attraction.
 */
export function createEntityLayout(
  nodes: ForceNode[],
  edges: ForceEdge[],
  confinementRadius: number,
  portTargets?: Float32Array,
  tuning: EntityForceConfig = defaultEntityForceConfig,
): ForceSimulation {
  const simulation = forceSimulation<ForceNode>(nodes)
    .force(
      "charge",
      forceManyBody<ForceNode>()
        .strength(tuning.chargeStrength)
        .distanceMax(tuning.chargeDistanceMax),
    )
    .force(
      "collide",
      forceCollide<ForceNode>(
        (node) => node.radius + tuning.collidePadding,
      ).iterations(tuning.collideIterations),
    )
    .force(
      "link",
      forceLink<ForceNode, ForceEdge>(edges)
        .id((node) => node.id)
        // forceLink resolves string endpoints to ForceNode objects before
        // distance/strength run; cast is safe after simulation init.
        .distance(
          (edge) =>
            ((edge.source as ForceNode).radius +
              (edge.target as ForceNode).radius) *
              tuning.linkDistanceMultiplier +
            tuning.linkDistancePadding,
        )
        .strength((edge) =>
          Math.min(1, tuning.linkStrengthFactor * edge.weight),
        ),
    )
    .force("centerX", forceX<ForceNode>(0).strength(tuning.centerStrength))
    .force("centerY", forceY<ForceNode>(0).strength(tuning.centerStrength))
    .alphaDecay(tuning.alphaDecay)
    .velocityDecay(tuning.velocityDecay)
    .stop();

  if (portTargets) {
    simulation.force(
      "port",
      forcePortAttraction(portTargets, tuning.portAttractionStrength),
    );
  }

  return new ForceSimulation(
    nodes,
    simulation,
    confinementRadius,
    tuning.settleAlpha,
  );
}

/**
 * Force layout for individual entities inside an opened leaf cluster.
 *
 * Entities should fill their bubble compactly: weak charge, collision spacing,
 * a gentle spring toward the center, and hard confinement to the bubble. Link
 * springs pull connected entities together. This is deliberately not the
 * cluster layout: bubbles need to spread and route edges; dots need to pack.
 *
 * On top of that, a port-attraction force pulls each entity toward the rim point
 * where its external connection leaves the leaf (its port target). This replaces
 * the old "fan out to a baked exit" model: the dots cluster near their real
 * exits, so the fan-out lines stay short and legible. The target array is shared
 * with (and updated live by) the worker, so as ports re-slot the dots follow,
 * with no baked, going-stale positions.
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

import { ForceSimulation } from "./force-simulation";

import type { ForceEdge, ForceNode } from "./force-simulation";
import type { Force } from "d3-force";

/** Gentle pull toward the bubble center; collision does the real spacing. */
const CENTER_STRENGTH = 0.05;
/** Pull toward the external port target; blends with (does not erase) center. */
const PORT_ATTRACTION_STRENGTH = 0.2;

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

export function createEntityLayout(
  nodes: ForceNode[],
  edges: ForceEdge[],
  confinementRadius: number,
  portTargets?: Float32Array,
): ForceSimulation {
  const simulation = forceSimulation<ForceNode>(nodes)
    .force("charge", forceManyBody<ForceNode>().strength(-1).distanceMax(50))
    .force(
      "collide",
      forceCollide<ForceNode>((node) => node.radius + 1).iterations(4),
    )
    .force(
      "link",
      forceLink<ForceNode, ForceEdge>(edges)
        .id((node) => node.id)
        .distance(
          (edge) =>
            ((edge.source as ForceNode).radius +
              (edge.target as ForceNode).radius) *
              2 +
            10,
        )
        .strength((edge) => Math.min(1, 0.3 * edge.weight)),
    )
    .force("centerX", forceX<ForceNode>(0).strength(CENTER_STRENGTH))
    .force("centerY", forceY<ForceNode>(0).strength(CENTER_STRENGTH))
    .alphaDecay(0.015)
    .velocityDecay(0.35)
    .stop();

  if (portTargets) {
    simulation.force(
      "port",
      forcePortAttraction(portTargets, PORT_ATTRACTION_STRENGTH),
    );
  }

  return new ForceSimulation(nodes, simulation, confinementRadius);
}

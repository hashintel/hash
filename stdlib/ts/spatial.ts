/** Spatial Functions */
import { PotentialAgent } from "./agent";

export type Distance =
  "euclidean" |
  "manhattan" |
  "euclidean_sq" |
  "chebyshev";

/**
 * Returns the specified distance between two agents.
 *  distance is one of the four distance functions supported by HASH,
 *  defaults to euclidean distance.
 * @param agentA
 * @param agentB
 * @param distance
 */
export function distanceBetween(
  agentA: PotentialAgent,
  agentB: PotentialAgent,
  distance: Distance = "euclidean"
) {
  type IdFuncs = {
    // eslint-disable-next-line no-unused-vars
    [index in Distance]: (a_pos: number[], b_pos: number[]) => number;
  };

  const { abs, pow, max, sqrt } = Math;

  const dFuncs: IdFuncs = {
    manhattan: (a_pos: number[], b_pos: number[]) =>
      abs(a_pos[0] - b_pos[0]) +
      abs(a_pos[1] - b_pos[1]) +
      abs(a_pos[2] - b_pos[2]),
    euclidean: (a_pos: number[], b_pos: number[]) =>
      sqrt(
        pow(a_pos[0] - b_pos[0], 2) +
          pow(a_pos[1] - b_pos[1], 2) +
          pow(a_pos[2] - b_pos[2], 2)
      ),
    euclidean_sq: (a_pos: number[], b_pos: number[]) =>
      pow(a_pos[0] - b_pos[0], 2) +
      pow(a_pos[1] - b_pos[1], 2) +
      pow(a_pos[2] - b_pos[2], 2),
    chebyshev: (a_pos: number[], b_pos: number[]) =>
      max(
        abs(a_pos[0] - b_pos[0]),
        abs(a_pos[1] - b_pos[1]),
        abs(a_pos[2] - b_pos[2])
      ),
  };

  const aPos: number[] | undefined =
    agentA.position || (agentA.get ? agentA.get("position") : undefined);
  const bPos: number[] | undefined =
    agentB.position || (agentB.get ? agentB.get("position") : undefined);

  if (!aPos || !bPos) {
    throw new Error("agents must have position");
  }
  if (!dFuncs[distance]) {
    throw new Error("distance must be one of 'euclidean', 'manhattan', 'euclidean_sq' or 'chebyshev'");
  }

  return dFuncs[distance](aPos, bPos);
}

/**
 * Returns the unit vector of the direction of an agent
 * @param a agent type
 */
export function normalizeVector(vec: number[]) {
  const magnitude = Math.sqrt(
    vec.reduce((acc: number, val: number) => acc + val ** 2, 0)
  );
  return vec.map((v) => v / magnitude);
}

/**
 * * Returns a position array of x,y,z is set to true
 * @param topology the Context.globals().topology object
 * @param z_plane defaults to false
 */
export function randomPosition(
  topology: {
    z_bounds: number[] | undefined;
    x_bounds: number[] | undefined;
    y_bounds: number[] | undefined;
  },
  z_plane = false
) {
  const { floor, random } = Math;

  let z_pos = 0;
  if (z_plane) {
    if (!topology.z_bounds) {
      throw new Error("topology z_bounds needed if z_plane flag set to true");
    }
    z_pos = floor(
      random() * (topology.z_bounds[1] - topology.z_bounds[0]) +
        topology.z_bounds[0]
    );
  }
  if (!topology.x_bounds || !topology.y_bounds) {
    throw new Error("topology missing x_bounds or y_bounds");
  }
  return [
    floor(
      random() * (topology.x_bounds[1] - topology.x_bounds[0]) +
        topology.x_bounds[0]
    ),
    floor(
      random() * (topology.y_bounds[1] - topology.y_bounds[0]) +
        topology.y_bounds[0]
    ),
    z_pos,
  ];
}

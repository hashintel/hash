/** Neighbor Functions */
import { PotentialAgent } from "./agent";

/**
 * Returns all neighbors that share an agent's position
 * @param agentA
 * @param neighbors - context.neighbors() array or array of agents
 * */
export function neighborsOnPosition(
  agentA: PotentialAgent,
  neighbors: PotentialAgent[]
) {
  return neighbors.filter((neighbor) => {
    const aPos: number[] | undefined =
      agentA.position || (agentA.get ? agentA.get("position") : undefined);
    const nPos: number[] | undefined =
      neighbor.position ||
      (neighbor.get ? neighbor.get("position") : undefined);

    if (!aPos || !nPos) {
      throw new Error("agents must have position");
    }

    for (let ind = 0; ind < aPos.length; ind++) {
      if (aPos[ind] !== nPos[ind]) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Returns all neighbors within a certain vision radius of an agent.
 * Defaults vision max_radius to 1, min_radius to 0
 * Default is 2D (z_axis set to false), set z_axis to true for 3D positions
 * @param agentA
 * @param neighbors - context.neighbors() array or array of agents
 * @param max_radius - defaults to 1
 * @param min_radius - defaults to 0
 * @param z_axis - defaults to false
 */
export function neighborsInRadius(
  agentA: PotentialAgent,
  neighbors: PotentialAgent[],
  max_radius = 1,
  min_radius = 0,
  z_axis = false
) {
  return neighbors.filter((neighbor) => {
    const aPos: number[] | undefined =
      agentA.position || (agentA.get ? agentA.get("position") : undefined);
    const nPos: number[] | undefined =
      neighbor.position ||
      (neighbor.get ? neighbor.get("position") : undefined);

    if (!aPos || !nPos) {
      throw new Error("agents must have position");
    }

    const notZ: number = z_axis ? 0 : 1;

    for (let ind = 0; ind < aPos.length - 1 * notZ; ind++) {
      const max = [aPos[ind] + max_radius, aPos[ind] - max_radius];
      const min = [aPos[ind] + min_radius, aPos[ind] - min_radius];
      if (
        !(
          (nPos[ind] <= max[0] && nPos[ind] >= min[0]) ||
          (nPos[ind] >= max[1] && nPos[ind] <= min[1])
        )
      ) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Searches and returns all neighbors whose positions are in front of an agent.
 * Default is set to planar calculations and will return all neighbors located
 * in front of the plane created by the agent's direction
 *
 * Colinear - If set to true, will return all neighbors on the same line as agent a.
 * @param agentA
 * @param neighbors - context.neighbors() array or array of agents
 * @param colinear - defaults to false
 */
export function neighborsInFront(
  agentA: PotentialAgent,
  neighbors: PotentialAgent[],
  colinear = false
) {
  return neighbors.filter((neighbor) => {
    const aPos: number[] | undefined =
      agentA.position || (agentA.get ? agentA.get("position") : undefined);
    const aDir: number[] | undefined =
      agentA.direction || (agentA.get ? agentA.get("direction") : undefined);
    const nPos: number[] | undefined =
      neighbor.position ||
      (neighbor.get ? neighbor.get("position") : undefined);

    if (!aPos || !nPos) {
      throw new Error("agents must have position");
    }
    if (!aDir) {
      throw new Error("agents must have direction");
    }

    if (colinear) {
      const count = aDir.reduce(function (n, val) {
        return n + val;
      }, 0);

      const dx = nPos[0] - aPos[0];
      const dy = nPos[1] - aPos[1];
      const dz = nPos[2] - aPos[2];

      const xt = aDir[0] !== 0 ? dx / aDir[0] : 0;
      const yt = aDir[1] !== 0 ? dy / aDir[1] : 0;
      const zt = aDir[2] !== 0 ? dz / aDir[2] : 0;

      // Only one direction set - only that axis value can change
      if (count === 1) {
        return (
          (xt > 0 && dy === 0 && dz === 0) ||
          (yt > 0 && dx === 0 && dz === 0) ||
          (zt > 0 && dx === 0 && dy === 0)
        );
      } else if (count === 2) { // Two directions set
        return (
          (xt === yt && xt > 0 && dz === 0) ||
          (yt === zt && yt > 0 && dx === 0) ||
          (xt === zt && xt > 0 && dy === 0)
        );
      } else if (count === 3) { // Three directions set
        return xt === yt && yt === zt && xt > 0;
      }

      // Else direction is [0,0,0] or an unsupported direction array
      return false;
    }

    // Planar calculations
    const dx = nPos[0] - aPos[0];
    const dy = nPos[1] - aPos[1];
    const dz = nPos[2] - aPos[2];

    const D = aDir[0] * dx + aDir[1] * dy + aDir[2] * dz;

    if (D <= 0) {
      return false;
    }

    return true;
  });
}

/**
 * Searches and returns all neighbors whose positions are behind an agent.
 * Default is set to planar calculations and will return all neighbors located
 * behind the plane created by the agent's direction
 *
 * Colinear - If set to true, will return all neighbors on the same line as agent a.
 * @param agentA
 * @param neighbors - context.neighbors() array or array of agents
 * @param colinear - defaults to false
 */
export function neighborsBehind(
  agentA: PotentialAgent,
  neighbors: PotentialAgent[],
  colinear = false
) {
  return neighbors.filter((neighbor) => {
    const aPos: number[] | undefined =
      agentA.position || (agentA.get ? agentA.get("position") : undefined);
    const aDir: number[] | undefined =
      agentA.direction || (agentA.get ? agentA.get("direction") : undefined);
    const nPos: number[] | undefined =
      neighbor.position ||
      (neighbor.get ? neighbor.get("position") : undefined);

    if (!aPos || !nPos) {
      throw new Error("agents must have position");
    }
    if (!aDir) {
      throw new Error("agents must have direction");
    }

    if (colinear) {
      const count = aDir.reduce(function (n, val) {
        return n + val;
      }, 0);

      const dx = nPos[0] - aPos[0];
      const dy = nPos[1] - aPos[1];
      const dz = nPos[2] - aPos[2];

      const xt = aDir[0] !== 0 ? (nPos[0] - aPos[0]) / aDir[0] : 0;
      const yt = aDir[1] !== 0 ? (nPos[1] - aPos[1]) / aDir[1] : 0;
      const zt = aDir[2] !== 0 ? (nPos[2] - aPos[2]) / aDir[2] : 0;

      // Only one direction set - only that axis value can change
      if (count === 1) {
        return (
          (xt < 0 && dy === 0 && dz === 0) ||
          (yt < 0 && dx === 0 && dz === 0) ||
          (zt < 0 && dx === 0 && dy === 0)
        );
      } else if (count === 2) { // Two directions set
        return (
          (xt === yt && xt < 0 && dz === 0) ||
          (yt === zt && yt < 0 && dx === 0) ||
          (xt === zt && xt < 0 && dy === 0)
        );
      } else if (count === 3) { // Three directions set
        return xt === yt && yt === zt && xt < 0;
      }

      // Else direction is [0,0,0] or an unsupported direction array
      return false;
    }

    // Planar calculations
    const dx = nPos[0] - aPos[0];
    const dy = nPos[1] - aPos[1];
    const dz = nPos[2] - aPos[2];

    const D = aDir[0] * dx + aDir[1] * dy + aDir[2] * dz;

    if (D >= 0) {
      return false;
    }

    return true;
  });
}

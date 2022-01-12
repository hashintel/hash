/** Neighbor Functions */
import { PotentialAgent } from "./agent";
import { Distance, distanceBetween } from "./spatial";

const posError = new Error("agent must have a position");
const dirError = new Error("agent must have a direction");

/**
 * Returns all neighbors that share an agent's position
 * @param agent
 * @param neighbors - context.neighbors() array, or an array of agents
 * */
export function neighborsOnPosition(
  agent: PotentialAgent,
  neighbors: PotentialAgent[],
) {
  return neighbors.filter((neighbor) => {
    const aPos = agent.position;
    const nPos = neighbor.position;

    if (!aPos || !nPos) {
      throw posError;
    }

    for (let i = 0; i < aPos.length; i++) {
      if (aPos[i] !== nPos[i]) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Returns all neighbors within a certain vision radius of an agent.
 * Default is 2D (`z_axis` set to false). Set `z_axis` to true for 3D positions.
 * @param agent
 * @param neighbors - context.neighbors() array, or an array of agents
 * @param max_radius - defaults to 1
 * @param min_radius - defaults to 0
 * @param distanceFunction - defaults to "euclidean"
 * @param z_axis - defaults to false
 */
export function neighborsInRadius(
  agent: PotentialAgent,
  neighbors: PotentialAgent[],
  max_radius: number = 1,
  min_radius: number = 0,
  distanceFunction: Distance = "euclidean",
  z_axis: boolean = false,
) {
  const aPos = agent.position;
  if (!aPos) {
    throw posError;
  }

  return neighbors.filter((neighbor) => {
    const nPos = neighbor.position;
    if (!nPos) {
      return false;
    }

    const d = distanceBetween(neighbor, agent, distanceFunction, z_axis);
    return d <= max_radius && d >= min_radius;
  });
}

/**
 * Searches and returns all neighbors whose positions are in front of an agent.
 * Default is set to planar calculations and will return all neighbors located
 * in front of the plane created by the agent's direction
 * @param agent
 * @param neighbors - context.neighbors() array or array of agents
 * @param colinear - If set to true, will return all agents on the same line as the agent.
 */
export function neighborsInFront(
  agent: PotentialAgent,
  neighbors: PotentialAgent[],
  colinear: boolean = false,
) {
  return neighbors.filter((neighbor) => {
    const aPos = agent.position;
    const aDir = agent.direction;
    const nPos = neighbor.position;

    if (!aPos || !nPos) {
      throw posError;
    }
    if (!aDir) {
      throw dirError;
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
      } else if (count === 2) {
        // Two directions set
        return (
          (xt === yt && xt > 0 && dz === 0) ||
          (yt === zt && yt > 0 && dx === 0) ||
          (xt === zt && xt > 0 && dy === 0)
        );
      } else if (count === 3) {
        // Three directions set
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
 * @param agent
 * @param neighbors - context.neighbors() array or array of agents
 * @param colinear - If set to true, will return all neighbors on the same line as the
 * agent a. Defaults to false
 */
export function neighborsBehind(
  agent: PotentialAgent,
  neighbors: PotentialAgent[],
  colinear = false,
) {
  return neighbors.filter((neighbor) => {
    const aPos = agent.position;
    const aDir = agent.direction;
    const nPos = neighbor.position;

    if (!aPos || !nPos) {
      throw posError;
    }
    if (!aDir) {
      throw dirError;
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
      } else if (count === 2) {
        // Two directions set
        return (
          (xt === yt && xt < 0 && dz === 0) ||
          (yt === zt && yt < 0 && dx === 0) ||
          (xt === zt && xt < 0 && dy === 0)
        );
      } else if (count === 3) {
        // Three directions set
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

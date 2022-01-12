/** Initialization Functions */
import { PotentialAgent } from "./agent";

export interface Topology {
  x_bounds: number[];
  y_bounds: number[];
  z_bounds?: number[];
}

export interface Globals {
  topology: Topology;
}

export interface Context {
  globals: () => Globals;
}

/** Initialization functions */
export const init = {
  scatter: (
    count: number,
    topology: Topology,
    template: PotentialAgent | Function,
  ) => scatter(count, topology, template),
  stack: (count: number, template: PotentialAgent | Function) =>
    stack(count, template),
  grid: (topology: Topology, template: PotentialAgent | Function) =>
    grid(topology, template),
  createLayout: (
    layout: string[][],
    templates: { [key: string]: PotentialAgent },
    offset: number[],
  ) => createLayout(layout, templates, offset),
};

function scatter(
  count: number,
  topology: Topology,
  template: PotentialAgent | Function,
) {
  const { x_bounds, y_bounds } = topology;

  const width = x_bounds[1] - x_bounds[0];
  const height = y_bounds[1] - y_bounds[0];

  // Return agents
  const agents = [...Array(count)].map((_) => {
    const position = [
      Math.floor(Math.random() * width) + x_bounds[0],
      Math.floor(Math.random() * height) + y_bounds[0],
    ];

    if (typeof template === "function") {
      return {
        ...template(),
        position,
      };
    } else {
      return {
        ...template,
        position,
      };
    }
  });

  return agents;
}

function stack(count: number, template: PotentialAgent | Function) {
  const agents = [...Array(count)].map((_) => {
    if (typeof template === "function") {
      return {
        ...template(),
      };
    } else {
      return {
        ...template,
      };
    }
  });

  return agents;
}

export function grid(topology: Topology, template: PotentialAgent | Function) {
  const { x_bounds, y_bounds } = topology;

  const width = x_bounds[1] - x_bounds[0];
  const height = y_bounds[1] - y_bounds[0];
  const count = width * height;

  // Return agents
  const agents = [...Array(count)].map((_, ind) => {
    const position = [
      (ind % width) + x_bounds[0],
      Math.floor(ind / width) + y_bounds[0],
    ];

    if (typeof template === "function") {
      return {
        ...template(),
        position,
      };
    } else {
      return {
        ...template,
        position,
      };
    }
  });

  return agents;
}

export function createLayout(
  layout: string[][],
  templates: { [key: string]: PotentialAgent },
  offset: number[] = [0, 0, 0],
) {
  const height = layout.length;
  const agents: { [key: string]: PotentialAgent[] } = {};

  layout.forEach((row, pos_y) => {
    row.forEach((type, pos_x) => {
      // If type value is in layout keys, create agent
      if (type in templates) {
        if (!(type in agents)) {
          agents[type] = [];
        }

        const agent_name =
          (templates[type].agent_name ?? type) + agents[type].length;

        agents[type].push({
          ...templates[type],
          agent_name,
          position: [
            pos_x + offset[0],
            height - pos_y + offset[1],
            0 + offset[2],
          ],
        });
      }
    });
  });

  // Flatten the agents into a single array
  const agent_list = [];
  for (const key in agents) {
    agent_list.push(...agents[key]);
  }

  return agent_list;
}

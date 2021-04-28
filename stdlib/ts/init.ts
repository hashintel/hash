/** Initialization Functions */
import { PotentialAgent } from "./agent";

const xBoundsError = new Error("globals.json must have topology.x_bounds defined");
const yBoundsError = new Error("globals.json must have topology.y_bounds defined");

export interface Topology {
    x_bounds: number[];
    y_bounds: number[];
    z_bounds?: number[];
}

export interface Globals {
    topology: Topology
}

export interface Context {
    globals: () => Globals
}

export function scatter(
    count: number,
    template: PotentialAgent,
    context: Context
) {
    const { x_bounds, y_bounds } = context.globals()["topology"];

    const width = x_bounds[1] - x_bounds[0];
    const height = y_bounds[1] - y_bounds[0];

    // Return agents
    const agents = [...Array(count)].map(_ => ({
        ...template,
        position: [
            Math.floor(Math.random() * width) + x_bounds[0],
            Math.floor(Math.random() * height) + y_bounds[0]
        ]
    }));

    return agents;
}
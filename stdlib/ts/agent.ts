import { v4 as uuid } from "uuid";

export type PotentialAgent = {
  position?: number[];
  direction?: number[];
  agent_name?: string;
  get?: (a: string) => any;
};

/**
 * Generate a valid UUID-V4 address to create a new agent with.
 */
export const generateAgentID = () => uuid();

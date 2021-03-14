import { v4 as uuid } from "uuid";

export type PotentialAgent = {
  position?: number[];
  direction?: number[];
  get?: (a: string) => any;
};

/**
 * Generate a valid uuid-v4 address to create a new with
 *
 * @param asStr Output the uuid as a string, if false, will output raw Uuid type
 */
export const generateAgentID = () => uuid();

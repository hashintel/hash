/**
 * This file contains the input and output types for the template agent.
 * These types define the input and output of the agent, and can be adjusted as
 * needed for new agents.
 *
 * These types MUST be called `Input` and `Output`
 */

export type Input = {
  emptyArray: any[] & { length: 0 };
  null: null;
  undefined: undefined;
};

// export type Output = {
//   /** Math expression result */
//   result: number;
// };

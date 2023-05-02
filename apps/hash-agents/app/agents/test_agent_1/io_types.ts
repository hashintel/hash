/**
 * This file contains the input and output types for the template agent.
 * These types define the input and output of the agent, and can be adjusted as
 * needed for new agents.
 *
 * These types MUST be called `Input` and `Output`
 */

export type Input = string;

export type Output = {
  /** Math expression result */
  result: {
    optionalString?: string;
    requiredNumber: number;
    mixedArray: (string | number)[];
    nestedObject: {
      nestedString: string;
      mixedNonEmptyArray: [string | number, ...(string | number)[]];
    };
  };
  nestedObject: {
    nestedNumber: number;
  };
};

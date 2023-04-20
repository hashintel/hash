/**
 * This file contains the input and output types for the template agent.
 * These types define the input and output of the agent, and can be adjusted as
 * needed for new agents.
 *
 * These types MUST be called `Input` and `Output`
 */

export type Input = {
  entityTypeTitle: string;
  entityTypeDescription: string;
};

export type Output = {
  propertyTypeDefinitions: {
    title: string;
    description: string;
    dataType: "text" | "number" | "boolean";
  }[];
};

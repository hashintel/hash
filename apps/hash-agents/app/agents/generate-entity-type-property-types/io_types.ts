/**
 * This file contains the input and output types for the
 * "generate-entity-type-property-types" agent. These types
 * define the input and output of the agent, and can be
 * adjusted as needed for new agents.
 *
 * These types MUST be called `Input` and `Output`
 */

export type Input = {
  entityTypeTitle: string;
  entityTypeDescription: string;
};

type NewPropertyTypeDefinition = {
  title: string;
  description: string;
  dataType: "text" | "number" | "boolean";
};

export type Output = {
  propertyTypeDefinitions: NewPropertyTypeDefinition[];
};

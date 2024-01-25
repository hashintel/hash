import type { PropertyType } from "@local/hash-graph-client";
import { EntityPropertyValue } from "@local/hash-subgraph";

export const createPropertyEmbeddingInput = (params: {
  propertyTypeSchema: Pick<PropertyType, "title">;
  propertyValue: EntityPropertyValue;
}): string => {
  return `${params.propertyTypeSchema.title}: ${typeof params.propertyValue === "string" ? params.propertyValue : JSON.stringify(params.propertyValue)}`;
};

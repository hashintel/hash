import type {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@blockprotocol/type-system";
import type { Entity } from "@local/hash-graph-sdk/entity";

export * from "./element/knowledge.js";
export * from "./element/ontology.js";

// Due to restrictions with how much OpenAPI can express, we patch the schemas with the better-typed ones from the
// type-system package.

export type GraphElement =
  | DataTypeWithMetadata
  | PropertyTypeWithMetadata
  | EntityTypeWithMetadata
  | Entity;

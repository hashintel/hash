import type { Entity } from "@local/hash-graph-types/entity";
import type {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-graph-types/ontology";

export * from "./element/knowledge";
export * from "./element/ontology";

// Due to restrictions with how much OpenAPI can express, we patch the schemas with the better-typed ones from the
// type-system package.

export type GraphElement =
  | DataTypeWithMetadata
  | PropertyTypeWithMetadata
  | EntityTypeWithMetadata
  | Entity;

import { BaseUrl, VersionedUrl } from "@blockprotocol/type-system/slim";

import { Entity, EntityId, EntityRecordId } from "../entity.js";
import {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  OntologyTypeRecordId,
  PropertyTypeWithMetadata,
} from "../ontology.js";
import { EntityIdWithInterval } from "./edges.js";
import { EntityIdWithTimestamp } from "./edges/outward-edge.js";
import {
  DataTypeVertex,
  EntityTypeVertex,
  EntityVertex,
  EntityVertexId,
  OntologyTypeVertexId,
  PropertyTypeVertex,
} from "./vertices.js";

/**
 * A utility type that maps various ways of identifying a single (or series of) element(s) of the graph to their
 * associated types.
 *
 * Helpful when creating generic functions that operate over a {@link Subgraph}
 */
export type GraphElementIdentifiers<Temporal extends boolean> =
  | {
      identifier: VersionedUrl | OntologyTypeVertexId | OntologyTypeRecordId;
      element:
        | DataTypeWithMetadata
        | PropertyTypeWithMetadata
        | EntityTypeWithMetadata;
      vertex: DataTypeVertex | PropertyTypeVertex | EntityTypeVertex;
    }
  | {
      identifier: BaseUrl;
      element:
        | DataTypeWithMetadata[]
        | PropertyTypeWithMetadata[]
        | EntityTypeWithMetadata[];
      vertex: DataTypeVertex[] | PropertyTypeVertex[] | EntityTypeVertex[];
    }
  | {
      identifier: EntityIdWithTimestamp | EntityVertexId | EntityRecordId;
      element: Entity<Temporal>;
      vertex: EntityVertex<Temporal>;
    }
  | {
      identifier: EntityId | EntityIdWithInterval;
      element: Entity<Temporal>[];
      vertex: EntityVertex<Temporal>[];
    };

/**
 * A helper type that takes a type `T` and a type `U`, and tries to select subtypes of `T` that match the given type
 * `U`. The intentions of this type are best explained by looking at its usages, {@link IdentifierForGraphElement} and
 * {@link GraphElementForIdentifier}.
 *
 * Note: this type is an implementation detail in those functions, it is not exported. Furthermore, `Reversed` is an
 * implementation detail which is helpful for which direction the subtype-check occurs in while recursing.
 *
 * This type relies on some fairly obscure behavior of how conditional types work in TypeScript, and is heavily
 * influenced by the implementation of the in-built `Extract` utility type.
 */
type RecursiveSelect<T, U, Reversed extends boolean = false> = T extends U
  ? Reversed extends false
    ? T
    : U
  : T extends { [key in keyof U]: unknown }
    ? T extends { [key in keyof U]: RecursiveSelect<U[key], T[key], true> }
      ? T
      : never
    : never;

/**
 * Helper type which returns the potential ways of identifying a given element of the graph by looking up the associated
 * mapping in {@link GraphElementIdentifiers}.
 */
export type IdentifierForGraphElement<
  Temporal extends boolean,
  Element extends GraphElementIdentifiers<Temporal>["element"],
> =
  // This extends keyof check is strange, and seems to be a limitation of typescript..
  "identifier" extends keyof RecursiveSelect<
    GraphElementIdentifiers<Temporal>,
    {
      element: Element;
    }
  >
    ? RecursiveSelect<
        GraphElementIdentifiers<Temporal>,
        {
          element: Element;
        }
      >["identifier"]
    : never;

/**
 * Helper type which returns the elements of the graph identified by the given identifier type, by looking up the
 * associated mapping in {@link GraphElementIdentifiers}.
 */
export type GraphElementForIdentifier<
  Temporal extends boolean,
  Identifier extends GraphElementIdentifiers<Temporal>["identifier"],
> =
  // This extends keyof check is strange, and seems to be a limitation of typescript..
  "element" extends keyof RecursiveSelect<
    GraphElementIdentifiers<Temporal>,
    {
      identifier: Identifier;
    }
  >
    ? RecursiveSelect<
        GraphElementIdentifiers<Temporal>,
        {
          identifier: Identifier;
        }
      >["element"]
    : never;

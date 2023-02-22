import { type GraphElementIdentifiers as GraphElementIdentifiersBp } from "@blockprotocol/graph/temporal";
import { VersionedUri } from "@blockprotocol/type-system/slim";
import { Subtype } from "@local/advanced-types/subtype";

import {
  DataTypeWithMetadata,
  Entity,
  EntityRecordId,
  EntityTypeWithMetadata,
  OntologyTypeRecordId,
  PropertyTypeWithMetadata,
} from "../element";
import { BaseUri, EntityId } from "../shared";
import { EntityIdWithInterval, EntityIdWithTimestamp } from "./edges";
import {
  DataTypeVertex,
  EntityTypeVertex,
  EntityVertex,
  EntityVertexId,
  OntologyTypeVertexId,
  PropertyTypeVertex,
} from "./vertices";

/**
 * A utility type that maps various ways of identifying a single (or series of) element(s) of the graph to their
 * associated types.
 *
 * Helpful when creating generic functions that operate over a {@link Subgraph}
 */
export type GraphElementIdentifiers = Subtype<
  GraphElementIdentifiersBp<true>,
  | {
      identifier: VersionedUri | OntologyTypeVertexId | OntologyTypeRecordId;
      element:
        | DataTypeWithMetadata
        | PropertyTypeWithMetadata
        | EntityTypeWithMetadata;
      vertex: DataTypeVertex | PropertyTypeVertex | EntityTypeVertex;
    }
  | {
      identifier: BaseUri;
      element:
        | DataTypeWithMetadata[]
        | PropertyTypeWithMetadata[]
        | EntityTypeWithMetadata[];
      vertex: DataTypeVertex[] | PropertyTypeVertex[] | EntityTypeVertex[];
    }
  | {
      identifier: EntityIdWithTimestamp | EntityVertexId | EntityRecordId;
      element: Entity;
      vertex: EntityVertex;
    }
  | {
      identifier: EntityId | EntityIdWithInterval;
      element: Entity[];
      vertex: EntityVertex[];
    }
>;

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
/* @todo - unsure why this doesn't work
import { type IdentifierForGraphElement as IdentifierForGraphElementBp }from "@blockprotocol/graph/temporal";
export type IdentifierForGraphElement<
  Element extends GraphElementIdentifiers["element"],
> = Subtype<
  IdentifierForGraphElementBp,
*/
export type IdentifierForGraphElement<
  Element extends GraphElementIdentifiers["element"],
> =
  // This extends keyof check is strange, and seems to be a limitation of typescript..
  "identifier" extends keyof RecursiveSelect<
    GraphElementIdentifiers,
    {
      element: Element;
    }
  >
    ? RecursiveSelect<
        GraphElementIdentifiers,
        {
          element: Element;
        }
      >["identifier"]
    : never;

/**
 * Helper type which returns the elements of the graph identified by the given identifier type, by looking up the
 * associated mapping in {@link GraphElementIdentifiers}.
 */
/* @todo - unsure why this doesn't work
import { type GraphElementForIdentifier as GraphElementForIdentifierBp }from "@blockprotocol/graph/temporal";
export type GraphElementForIdentifier<
  Identifier extends GraphElementIdentifiers["identifier"],
> = Subtype<
  GraphElementForIdentifierBp,
*/
export type GraphElementForIdentifier<
  Identifier extends GraphElementIdentifiers["identifier"],
> =
  // This extends keyof check is strange, and seems to be a limitation of typescript..
  "element" extends keyof RecursiveSelect<
    GraphElementIdentifiers,
    {
      identifier: Identifier;
    }
  >
    ? RecursiveSelect<
        GraphElementIdentifiers,
        {
          identifier: Identifier;
        }
      >["element"]
    : never;

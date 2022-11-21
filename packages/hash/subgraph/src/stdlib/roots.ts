import {
  DataTypeWithMetadata,
  EntityWithMetadata,
  EntityTypeWithMetadata,
  GraphElement,
  PropertyTypeWithMetadata,
} from "../types/element";
import { Subgraph } from "../types/subgraph";
import { getDataTypeByEditionId } from "./element/data-type";
import {
  isEntityEditionId,
  isOntologyTypeEditionId,
} from "../types/identifier";
import { getPropertyTypeByEditionId } from "./element/property-type";
import { getEntityTypeByEditionId } from "./element/entity-type";
import { getEntityByEditionId } from "./element/entity";
import { Vertex } from "../types/vertex";
import { mustBeDefined } from "../shared/invariant";

/**
 * Returns all root elements.
 *
 * The type of this can be constrained by using some of the helper type-guards:
 * - isDataTypeRootedSubgraph
 * - isPropertyTypeRootedSubgraph
 * - isEntityTypeRootedSubgraph
 * - isEntityRootedSubgraph
 *
 * @param subgraph
 */
export const getRoots = <RootType extends GraphElement>(
  subgraph: Subgraph<RootType>,
): RootType[] =>
  subgraph.roots.map((rootEditionId) => {
    const root = mustBeDefined(
      subgraph.vertices[rootEditionId.baseId]?.[
        // We could use type-guards here to convince TS that it's safe, but that would be slower, it's currently not
        // smart enough to realise this can produce a value of type `Vertex` as it struggles with discriminating
        // `EntityId` and `BaseUri`
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (rootEditionId as any).version
      ] as Vertex,
      `roots should have corresponding vertices but ${JSON.stringify(
        rootEditionId,
      )} was missing`,
    );

    return root.inner as RootType;
  });

/**
 * A type-guard that can be used to constrain the generic parameter of `Subgraph` to `DataTypeWithMetadata`.
 *
 * Doing so will help TS infer that `getRoots` returns `DataTypeWithMetadata`s, removing the need for additional
 * type checks or casts.
 *
 * @param subgraph
 */
export const isDataTypeRootedSubgraph = (
  subgraph: Subgraph,
): subgraph is Subgraph<DataTypeWithMetadata> => {
  for (const rootEditionId of subgraph.roots) {
    if (!isOntologyTypeEditionId(rootEditionId)) {
      return false;
    }

    mustBeDefined(
      getDataTypeByEditionId(subgraph, rootEditionId),
      `roots should have corresponding vertices but ${JSON.stringify(
        rootEditionId,
      )} was missing`,
    );
  }

  return true;
};

/**
 * A type-guard that can be used to constrain the generic parameter of `Subgraph` to `PropertyTypeWithMetadata`.
 *
 * Doing so will help TS infer that `getRoots` returns `PropertyTypeWithMetadata`s, removing the need for additional
 * type checks or casts.
 *
 * @param subgraph
 */
export const isPropertyTypeRootedSubgraph = (
  subgraph: Subgraph,
): subgraph is Subgraph<PropertyTypeWithMetadata> => {
  for (const rootEditionId of subgraph.roots) {
    if (!isOntologyTypeEditionId(rootEditionId)) {
      return false;
    }

    mustBeDefined(
      getPropertyTypeByEditionId(subgraph, rootEditionId),
      `roots should have corresponding vertices but ${JSON.stringify(
        rootEditionId,
      )} was missing`,
    );
  }

  return true;
};

/**
 * A type-guard that can be used to constrain the generic parameter of `Subgraph` to `EntityTypeWithMetadata`.
 *
 * Doing so will help TS infer that `getRoots` returns `EntityTypeWithMetadata`s, removing the need for additional
 * type checks or casts.
 *
 * @param subgraph
 */
export const isEntityTypeRootedSubgraph = (
  subgraph: Subgraph,
): subgraph is Subgraph<EntityTypeWithMetadata> => {
  for (const rootEditionId of subgraph.roots) {
    if (!isOntologyTypeEditionId(rootEditionId)) {
      return false;
    }

    mustBeDefined(
      getEntityTypeByEditionId(subgraph, rootEditionId),
      `roots should have corresponding vertices but ${JSON.stringify(
        rootEditionId,
      )} was missing`,
    );
  }

  return true;
};

/**
 * A type-guard that can be used to constrain the generic parameter of `Subgraph` to `Entity`.
 *
 * Doing so will help TS infer that `getRoots` returns `Entity`s, removing the need for additional
 * type checks or casts.
 *
 * @param subgraph
 */
export const isEntityRootedSubgraph = (
  subgraph: Subgraph,
): subgraph is Subgraph<EntityWithMetadata> => {
  for (const rootEditionId of subgraph.roots) {
    if (!isEntityEditionId(rootEditionId)) {
      return false;
    }

    mustBeDefined(
      getEntityByEditionId(subgraph, rootEditionId),
      `roots should have corresponding vertices but ${JSON.stringify(
        rootEditionId,
      )} was missing`,
    );
  }

  return true;
};

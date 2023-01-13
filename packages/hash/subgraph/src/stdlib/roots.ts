import { mustBeDefined } from "../shared/invariant";
import { isEntityVertexId, isOntologyTypeEditionId } from "../types/identifier";
import {
  Subgraph,
  SubgraphRootType,
  SubgraphRootTypes,
} from "../types/subgraph";
import { Vertex } from "../types/vertex";
import { getDataTypeByEditionId } from "./element/data-type";
import { getEntityByVertexId } from "./element/entity";
import { getEntityTypeByEditionId } from "./element/entity-type";
import { getPropertyTypeByEditionId } from "./element/property-type";

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
export const getRoots = <RootType extends SubgraphRootType>(
  subgraph: Subgraph<RootType>,
): RootType["element"][] =>
  subgraph.roots.map((rootVertexId) => {
    const root = mustBeDefined(
      subgraph.vertices[rootVertexId.baseId]?.[
        // We could use type-guards here to convince TS that it's safe, but that would be slower, it's currently not
        // smart enough to realise this can produce a value of type `Vertex` as it struggles with discriminating
        // `EntityId` and `BaseUri`
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        rootVertexId.version as any
      ] as Vertex,
      `roots should have corresponding vertices but ${JSON.stringify(
        rootVertexId,
      )}`,
    );

    return root.inner as RootType["element"];
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
): subgraph is Subgraph<SubgraphRootTypes["dataType"]> => {
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
): subgraph is Subgraph<SubgraphRootTypes["propertyType"]> => {
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
): subgraph is Subgraph<SubgraphRootTypes["entityType"]> => {
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
): subgraph is Subgraph<SubgraphRootTypes["entity"]> => {
  for (const rootVertexId of subgraph.roots) {
    if (!isEntityVertexId(rootVertexId)) {
      return false;
    }

    mustBeDefined(
      getEntityByVertexId(subgraph, rootVertexId),
      `roots should have corresponding vertices but ${JSON.stringify(
        rootVertexId,
      )} was missing`,
    );
  }

  return true;
};

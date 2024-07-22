import type { Subgraph as SubgraphBp } from "@blockprotocol/graph";
import {
  isDataTypeRootedSubgraph as isDataTypeRootedSubgraphBp,
  isEntityRootedSubgraph as isEntityRootedSubgraphBp,
  isEntityTypeRootedSubgraph as isEntityTypeRootedSubgraphBp,
  isPropertyTypeRootedSubgraph as isPropertyTypeRootedSubgraphBp,
} from "@blockprotocol/graph/stdlib";

import type {
  DataTypeRootType,
  EntityRootType,
  EntityTypeRootType,
  PropertyTypeRootType,
  Subgraph,
  SubgraphRootType,
  Vertex,
} from "../../main.js";
import { mustBeDefined } from "../../shared/invariant.js";

/**
 * Returns all root elements.
 *
 * For a narrower return type, first narrow the type of `subgraph` by using one of the helper type-guards:
 * - {@link isDataTypeRootedSubgraph}
 * - {@link isPropertyTypeRootedSubgraph}
 * - {@link isEntityTypeRootedSubgraph}
 * - {@link isEntityRootedSubgraph}
 *
 * @param subgraph
 */
export const getRoots = <RootType extends SubgraphRootType>(
  subgraph: Subgraph<RootType>,
): RootType["element"][] =>
  subgraph.roots.map((rootVertexId) => {
    const root = mustBeDefined(
      // @ts-expect-error - We could use type-guards here to convince TS that it's safe, but that
      //                    would be slower, it's currently not smart enough to realise this can
      //                    produce a value of type `Vertex` as it struggles with discriminating
      //                    `EntityId` and `BaseUrl`
      subgraph.vertices[rootVertexId.baseId]?.[
        rootVertexId.revisionId
      ] as Vertex,
      `roots should have corresponding vertices but ${JSON.stringify(
        rootVertexId,
      )} was missing`,
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
): subgraph is Subgraph<DataTypeRootType> =>
  isDataTypeRootedSubgraphBp(subgraph as unknown as SubgraphBp);

/**
 * A type assertion that can be used to assert the generic of `Subgraph` to `DataTypeWithMetadata`.
 *
 * @param subgraph
 */
export const assertDataTypeRootedSubgraph: (
  subgraph: Subgraph,
) => asserts subgraph is Subgraph<DataTypeRootType> = (subgraph) => {
  if (!isDataTypeRootedSubgraph(subgraph)) {
    throw new Error("Expected subgraph to be an data type rooted subgraph");
  }
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
): subgraph is Subgraph<PropertyTypeRootType> =>
  isPropertyTypeRootedSubgraphBp(subgraph as unknown as SubgraphBp);

/**
 * A type assertion that can be used to assert the generic of `Subgraph` to `PropertyTypeWithMetadata`.
 *
 * @param subgraph
 */
export const assertPropertyTypeRootedSubgraph: (
  subgraph: Subgraph,
) => asserts subgraph is Subgraph<PropertyTypeRootType> = (subgraph) => {
  if (!isPropertyTypeRootedSubgraph(subgraph)) {
    throw new Error("Expected subgraph to be an property type rooted subgraph");
  }
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
): subgraph is Subgraph<EntityTypeRootType> =>
  isEntityTypeRootedSubgraphBp(subgraph as unknown as SubgraphBp);

/**
 * A type assertion that can be used to assert the generic of `Subgraph` to `EntityTypeWithMetadata`.
 *
 * @param subgraph
 */
export const assertEntityTypeRootedSubgraph: (
  subgraph: Subgraph,
) => asserts subgraph is Subgraph<EntityTypeRootType> = (subgraph) => {
  if (!isEntityTypeRootedSubgraph(subgraph)) {
    throw new Error("Expected subgraph to be an entity type rooted subgraph");
  }
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
): subgraph is Subgraph<EntityRootType> =>
  isEntityRootedSubgraphBp(subgraph as unknown as SubgraphBp);

/**
 * A type assertion that can be used to assert the generic of `Subgraph` to `Entity`.
 *
 * @param subgraph
 */
export const assertEntityRootedSubgraph: (
  subgraph: Subgraph,
) => asserts subgraph is Subgraph<EntityRootType> = (subgraph) => {
  if (!isEntityRootedSubgraph(subgraph)) {
    throw new Error("Expected subgraph to be an entity rooted subgraph");
  }
};

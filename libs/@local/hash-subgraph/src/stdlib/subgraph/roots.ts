import { Subgraph as SubgraphBp } from "@blockprotocol/graph/temporal";
import {
  getRoots as getRootsBp,
  isDataTypeRootedSubgraph as isDataTypeRootedSubgraphBp,
  isEntityRootedSubgraph as isEntityRootedSubgraphBp,
  isEntityTypeRootedSubgraph as isEntityTypeRootedSubgraphBp,
  isPropertyTypeRootedSubgraph as isPropertyTypeRootedSubgraphBp,
} from "@blockprotocol/graph/temporal/stdlib";
import {
  EntityMetadata as GraphApiEntityMetadata,
  Subgraph as GraphApiSubgraph,
} from "@local/hash-graph-client";

import {
  DataTypeRootType,
  EntityMetadata,
  EntityRootType,
  EntityTypeRootType,
  PropertyTypeRootType,
  Subgraph,
  SubgraphRootType,
} from "../../main";

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
  getRootsBp(subgraph as unknown as SubgraphBp<RootType>);

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

/**
 * A mapping function that can be used to map the subgraph returned by the Graph API to the HASH `Subgraph` definition.
 *
 * @param subgraph
 */
export const mapGraphApiSubgraphToSubgraph = <
  RootType extends SubgraphRootType,
>(
  subgraph: GraphApiSubgraph,
) => subgraph as Subgraph<RootType>;

/**
 * A mapping function that can be used to map entity metadata returned by the Graph API to the HASH `EntityMetadata` definition.
 */
export const mapGraphApiEntityMetadataToMetadata = (
  metadata: GraphApiEntityMetadata,
) => metadata as EntityMetadata;

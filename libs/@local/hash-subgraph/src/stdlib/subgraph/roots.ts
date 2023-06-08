import { Subgraph as SubgraphBp } from "@blockprotocol/graph/temporal";
import {
  getRoots as getRootsBp,
  isDataTypeRootedSubgraph as isDataTypeRootedSubgraphBp,
  isEntityRootedSubgraph as isEntityRootedSubgraphBp,
  isEntityTypeRootedSubgraph as isEntityTypeRootedSubgraphBp,
  isPropertyTypeRootedSubgraph as isPropertyTypeRootedSubgraphBp,
} from "@blockprotocol/graph/temporal/stdlib";

import {
  DataTypeRootType,
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

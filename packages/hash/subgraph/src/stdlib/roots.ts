import {
  DataTypeWithMetadata,
  Entity,
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

export const getRoots = <RootType extends GraphElement>(
  subgraph: Subgraph<RootType>,
): RootType[] =>
  subgraph.roots.map((rootEditionId) => {
    const root = subgraph.vertices[rootEditionId.baseId]?.[
      // We could use type-guards here to convince TS that it's safe, but that would be slower, it's currently not
      // smart enough to realise this can produce a value of type `Vertex` as it struggles with discriminating
      // `EntityId` and `BaseUri`
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (rootEditionId as any).version
    ] as Vertex;

    if (!root) {
      throw new Error(
        `couldn't find the root ${JSON.stringify(
          rootEditionId,
        )} in the vertex set`,
      );
    }

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

    const dataType = getDataTypeByEditionId(subgraph, rootEditionId);
    if (!dataType) {
      throw new Error(
        `missing root data type with id: ${JSON.stringify(rootEditionId)}`,
      );
    }
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

    const propertyType = getPropertyTypeByEditionId(subgraph, rootEditionId);
    if (!propertyType) {
      throw new Error(
        `missing root property type with id: ${JSON.stringify(rootEditionId)}`,
      );
    }
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

    const entityType = getEntityTypeByEditionId(subgraph, rootEditionId);
    if (!entityType) {
      throw new Error(
        `missing root entity type with id: ${JSON.stringify(rootEditionId)}`,
      );
    }
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
): subgraph is Subgraph<Entity> => {
  for (const rootEditionId of subgraph.roots) {
    if (!isEntityEditionId(rootEditionId)) {
      return false;
    }

    const entity = getEntityByEditionId(subgraph, rootEditionId);
    if (!entity) {
      throw new Error(
        `missing root entity with id: ${JSON.stringify(rootEditionId)}`,
      );
    }
  }

  return true;
};

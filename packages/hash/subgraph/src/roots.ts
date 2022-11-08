import {
  extractBaseUri,
  extractVersion,
} from "@blockprotocol/type-system-node";

import { isEntityEditionId } from "./identifier";
import {
  DataTypeWithMetadata,
  Entity,
  EntityTypeWithMetadata,
  GraphElement,
  PropertyTypeWithMetadata,
  Subgraph,
} from "./types";
import { getEntity } from "./element/entity";
import { getDataType } from "./element/data-type";
import { getPropertyType } from "./element/property-type";
import { getEntityType } from "./element/entity-type";

export const getRoots = <RootType extends GraphElement>(
  subgraph: Subgraph<RootType>,
): RootType[] =>
  subgraph.roots.map((rootEditionId) => {
    let root;

    // TODO: if we just made the root identifiers arrays (or the same shape) then we wouldn't need a type-guard
    if (isEntityEditionId(rootEditionId)) {
      root =
        subgraph.vertices[rootEditionId.entityIdentifier]?.[
          rootEditionId.version
        ];
    } else {
      root =
        subgraph.vertices[extractBaseUri(rootEditionId)]?.[
          extractVersion(rootEditionId)
        ];
    }

    if (!root) {
      throw new Error(
        `couldn't find the root ${JSON.stringify(
          rootEditionId,
        )} in the vertex set`,
      );
    }

    return root.inner as RootType;
  });

export const isDataTypeRootedSubgraph = (
  subgraph: Subgraph,
): subgraph is Subgraph<DataTypeWithMetadata> => {
  for (const rootEditionId of subgraph.roots) {
    if (isEntityEditionId(rootEditionId)) {
      return false;
    }

    const entity = getDataType(subgraph, rootEditionId);
    if (!entity) {
      throw new Error(
        `missing root data type with id: ${JSON.stringify(rootEditionId)}`,
      );
    }
  }

  return true;
};

export const isPropertyTypeRootedSubgraph = (
  subgraph: Subgraph,
): subgraph is Subgraph<PropertyTypeWithMetadata> => {
  for (const rootEditionId of subgraph.roots) {
    if (isEntityEditionId(rootEditionId)) {
      return false;
    }

    const entity = getPropertyType(subgraph, rootEditionId);
    if (!entity) {
      throw new Error(
        `missing root property type with id: ${JSON.stringify(rootEditionId)}`,
      );
    }
  }

  return true;
};

export const isEntityTypeRootedSubgraph = (
  subgraph: Subgraph,
): subgraph is Subgraph<EntityTypeWithMetadata> => {
  for (const rootEditionId of subgraph.roots) {
    if (isEntityEditionId(rootEditionId)) {
      return false;
    }

    const entity = getEntityType(subgraph, rootEditionId);
    if (!entity) {
      throw new Error(
        `missing root entity type with id: ${JSON.stringify(rootEditionId)}`,
      );
    }
  }

  return true;
};

export const isEntityRootedSubgraph = (
  subgraph: Subgraph,
): subgraph is Subgraph<Entity> => {
  for (const rootEditionId of subgraph.roots) {
    if (!isEntityEditionId(rootEditionId)) {
      return false;
    }

    const entity = getEntity(subgraph, rootEditionId);
    if (!entity) {
      throw new Error(
        `missing root entity with id: ${JSON.stringify(rootEditionId)}`,
      );
    }
  }

  return true;
};

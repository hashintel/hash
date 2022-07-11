import { cloneDeep } from "lodash";
import { JSONObject } from "blockprotocol";

import {
  isParsedJsonObject,
  isParsedJsonObjectOrArray,
} from "@hashintel/hash-shared/json-utils";
import { UnknownEntity } from "../graphql/apiTypes.gen";

/* eslint-disable no-param-reassign */

/**
 * @todo: refactor to adhere to no-param-reassign
 */

/**
 * MUTATES an object in order to:
 * - delete all non-id and non-type metadata fields from the root,
 * UNLESS the second argument is 'false'
 * - adds the contents of its 'properties' field to the root
 * - delete the 'properties' field
 * @returns void
 */
const destructivelyMoveEntityPropertiesToRoot = (
  entity: Partial<UnknownEntity>,
  preserveExtraMetadata: boolean = false,
) => {
  if (!preserveExtraMetadata) {
    for (const key of Object.keys(entity)) {
      if (
        key !== "id" &&
        key !== "accountId" &&
        key !== "entityId" &&
        key !== "entityType" &&
        key !== "linkGroups" &&
        key !== "linkedEntities" &&
        key !== "linkedAggregations" &&
        key !== "properties"
      ) {
        delete entity[key as keyof UnknownEntity];
      }
    }
  }
  Object.assign(entity, entity.properties);
  delete entity.properties;
};

/**
 * Creates a deep clone of an entity with the contents of the 'properties'
 * field moved to the root of the cloned object.
 *
 * Deletes existing root fields which aren't related to the entity's id or type,
 * UNLESS false is passed as the second argument.
 * @returns the cloned entity, transformed
 */
const cloneEntityWithPropertiesAtRoot = (
  entity: Partial<UnknownEntity>,
  preserveExtraMetadata: boolean = false,
) => {
  const clone = cloneDeep(entity);
  destructivelyMoveEntityPropertiesToRoot(clone, preserveExtraMetadata);
  return clone;
};

/**
 * @todo rework this to only move properties up for root entity
 *    - entities no longer have other entities in their trees
 *
 * Clones an entity tree, and for each entity within it,
 * moves the contents of its 'properties' to the root of that entity.
 *
 * Deletes existing root fields unless they relate to the entity's id or type.
 * To preserve all existing root fields, pass 'false' as the second argument.
 * @param entity The entity to clone
 * @param preserveExtraMetadata Whether to keep non-id and non-type metadata.
 * Defaults to FALSE: extra metadata (e.g. accountId, visibility) will be deleted.
 * @returns the entity tree clone, transformed.
 */
export const cloneEntityTreeWithPropertiesMovedUp = (
  entity: Partial<UnknownEntity>,
  preserveExtraMetadata: boolean = false,
) => {
  const clonedTree = cloneEntityWithPropertiesAtRoot(
    entity,
    preserveExtraMetadata,
  );

  const propertiesToCheck = Object.values(clonedTree).filter(
    isParsedJsonObjectOrArray,
  );

  while (propertiesToCheck.length > 0) {
    const property = propertiesToCheck.pop()!;

    if (Array.isArray(property)) {
      propertiesToCheck.push(...property.filter(isParsedJsonObjectOrArray));
      continue;
    }

    if (
      !property.entityId ||
      !property.properties ||
      !isParsedJsonObject(property.properties)
    ) {
      // This is a non-entity object - it might have entities deeper in its tree
      propertiesToCheck.push(
        ...Object.values(property).filter(isParsedJsonObjectOrArray),
      );
      continue;
    }

    propertiesToCheck.push(
      ...Object.values(property.properties).filter(isParsedJsonObjectOrArray),
    );

    destructivelyMoveEntityPropertiesToRoot(property, preserveExtraMetadata);
  }
  return clonedTree;
};

/**
 * We are working on a first-class label concept that would replace this function.
 */
export const guessEntityName = (entity: JSONObject) => {
  const { name, preferredName, displayName, title, shortname, legalName } =
    isParsedJsonObject(entity.properties) ? entity.properties : entity;
  return (
    name ??
    preferredName ??
    displayName ??
    title ??
    shortname ??
    legalName ??
    entity.entityId ??
    "Entity"
  ).toString();
};

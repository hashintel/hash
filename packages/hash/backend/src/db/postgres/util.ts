import { Entity } from "../adapter";

const isObject = (val: any) => typeof val === "object" && val !== null;

const isObjectOrArray = (val: any) => Array.isArray(val) || isObject(val);

/**
 * Recursively traverse the properties of an entity, gathering the IDs of all entities
 * it references through the __linkedData field.
 * */
export const gatherLinks = (entity: Entity): string[] => {
  // Note: the implementation is not actually recursive. NodeJS does not perform tail-call
  // optimization which presents a performance penalty for deeply nested entities.
  // Instead, we're doing an iterative depth-first search of the object tree.

  // Block entities are a special case. They (currently) don't have a __linkedData field,
  // but reference the entity they wrap with an "entityId" property.
  if (entity.type === "Block") {
    return [entity.properties.entityId as string];
  }

  // Page entities are another special case
  if (entity.type === "Page") {
    return entity.properties.contents.map(
      (item: { entityId: string }) => item.entityId as string
    );
  }

  if (!isObject(entity.properties)) {
    throw new Error(
      `entity ${entity.entityId} has invalid type for field "properties"`
    );
  }

  const linkedEntityIds: string[] = [];
  const stack: any[] = Object.values(entity.properties).filter(isObjectOrArray);

  while (stack.length > 0) {
    const item = stack.pop();

    if (Array.isArray(item)) {
      stack.push(...item.filter(isObjectOrArray));
      continue;
    }

    const entityId = item.__linkedData?.entityId;
    if (entityId) {
      linkedEntityIds.push(entityId as string);
    } else {
      stack.push(...Object.values(item).filter(isObjectOrArray));
    }
  }

  return linkedEntityIds;
};

/** Mutate an entitiy's properties **in-place** by replacing all linked data from
 * one entity ID to another entity ID.
 */
export const replaceLink = (
  entity: Entity,
  replace: { old: string; new: string }
) => {
  // Need to do special cases for now like in `gatherLinks` above.

  if (entity.type === "Block") {
    if (entity.properties.entityId === replace.old) {
      entity.properties.entityId = replace.new;
    }
    return;
  }

  if (entity.type === "Page") {
    for (let i = 0; i < entity.properties.contents.length; i++) {
      const item = entity.properties.contents[i];
      if (item.entityId === replace.old) {
        item.entityId = replace.new;
      }
    }
    return;
  }

  if (!isObject(entity.properties)) {
    throw new Error(
      `entity ${entity.entityId} has invalid type for field "properties"`
    );
  }

  // TODO: there's some duplication here with `gatherLinks`. Consider refactoring
  // the search into a separate function.
  const stack: any[] = Object.values(entity.properties).filter(isObjectOrArray);
  while (stack.length > 0) {
    const item = stack.pop();

    if (Array.isArray(item)) {
      stack.push(...item.filter(isObjectOrArray));
      continue;
    }

    const entityId = item.__linkedData?.entityId;
    if (entityId) {
      if (entityId === replace.old) {
        item.__linkedData.entityId = replace.new;
      }
    } else {
      stack.push(...Object.values(item).filter(isObjectOrArray));
    }
  }
};

export const entityNotFoundError = (ref: {
  accountId: string;
  entityId: string;
}) => {
  return new Error(
    `entity ${ref.entityId} not found in account ${ref.accountId}`
  );
};

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
      `entity ${entity.id} has invalid type for field "properties"`
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

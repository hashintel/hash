import { Entity } from "../adapter";

const isObject = (v: any) => typeof v === "object" && v !== null;

const isObjectOrArray = (v: any) => Array.isArray(v) || isObject(v);

/** Recursively traverse the properties of an entity, gathering the IDs of all entities
 * it references through the __linkedData field.
 */
export const gatherLinks = (entity: Entity) => {
  // Note: the implementation is not actually recursive. NodeJS does not perform tail-call
  // optimization which presents a performance penalty for deeply nested entities.
  // Instead, we're doing an iterative depth-first search of the object tree.

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

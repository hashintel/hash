import { DbPageProperties, DbBlockProperties } from "../../types/dbTypes";
import { Entity } from "../adapter";

const isObject = (val: any) => typeof val === "object" && val !== null;

const isObjectOrArray = (val: any) => Array.isArray(val) || isObject(val);

// @todo: it would be preferrable to import the __linkedData type definition from
// adapter.ts to avoid duplication. However, that type includes `entityTypeId` which
// is not currently set by the links in "Block" entities. Return here when we refactor
// the definition of Block entities to use the __linkedData concept.
export type Link = {
  entityId: string;
  entityVersionId?: string;
};

/**
 * Recursively traverse the properties of an entity, gathering the IDs of all entities
 * it references through the `__linkedData` field.
 * */
export const gatherLinks = (entity: Entity): Link[] => {
  // Block entities are a special case. They (currently) don't have a __linkedData field,
  // but reference the entity they wrap with an "entityId" property.
  if (entity.entityTypeName === "Block") {
    const properties = entity.properties as DbBlockProperties;
    return [
      {
        entityId: properties.entityId,
      },
    ];
  }

  // Page entities are another special case. The links to the blocks are contained in
  // its "contents" array property.
  if (entity.entityTypeName === "Page") {
    const properties = entity.properties as DbPageProperties;
    return properties.contents.map((item) => ({
      entityId: item.entityId,
    }));
  }

  if (!isObject(entity.properties)) {
    throw new Error(
      `entity version ${entity.entityVersionId} has invalid type for field "properties"`
    );
  }

  const linksSeen = new Set<string>();
  const links: Link[] = [];

  // Push a Link onto linkedEntities if it's not already present
  const pushLinkedEntity = (link: Link) => {
    const id = link.entityId + (link.entityVersionId || "");
    if (linksSeen.has(id)) {
      return;
    }
    linksSeen.add(id);
    links.push(link);
  };

  const stack: any[] = Object.values(entity.properties).filter(isObjectOrArray);
  while (stack.length > 0) {
    const item = stack.pop();

    if (Array.isArray(item)) {
      stack.push(...item.filter(isObjectOrArray));
      continue;
    }

    const linkedData = item.__linkedData;
    if (linkedData) {
      try {
        const link = getLink(linkedData);
        if (link) {
          pushLinkedEntity(link);
        }
      } catch (err) {
        throw new Error(
          `invalid __linkedData in entity version ${entity.entityVersionId}: ${err}`
        );
      }
    } else {
      stack.push(...Object.values(item).filter(isObjectOrArray));
    }
  }

  return links;
};

/** Validates a `__linkedData` field. Returns a `Link` if it's valid, otherwise, the
 * function throws an error. */
const getLink = (linkedData: any): Link | null => {
  if (!isObject(linkedData)) {
    throw new Error("must be an object");
  }
  if (linkedData.aggregate) {
    // We can ignore linked data based on an aggregation here
    return null;
  }
  if (!linkedData.entityId) {
    throw new Error("field 'entityId' missing");
  }
  if (!(typeof linkedData.entityId === "string")) {
    throw new Error("field 'entityId' must be a string");
  }
  if (
    linkedData.entityVersionId &&
    !(typeof linkedData.entityVersionId === "string")
  ) {
    throw new Error("field 'entityVersionId', if set, must be a string");
  }
  return {
    entityId: linkedData.entityId,
    entityVersionId: linkedData.entityVersionId,
  };
};

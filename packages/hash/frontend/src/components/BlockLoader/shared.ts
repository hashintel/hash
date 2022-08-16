import { JsonObject, UnknownRecord } from "@blockprotocol/core";
import { BlockGraph, Entity } from "@blockprotocol/graph";
import { get, set } from "lodash";

export type SchemaMap = {
  mapId: string;
  transformations?: {
    [destinationKey: string]:
      | {
          default?: any;
          sourceKey?: string;
        }
      | undefined;
  };
};

type JsonPath = `$.${string}`;

const isJsonPath = (path: unknown): path is JsonPath =>
  typeof path === "string" && path.startsWith("$.");

/** strips the leading "$." from a jsonpath, if present */
const pathWithoutLeadingChars = (jsonPath: JsonPath | string) =>
  jsonPath.replace(/^\$\./, "");

/**
 * Converts a source entity, linkedEntities and linkGroups into a data tree
 * @todo support linkedAggregations
 */
export const dataTreeFromEntityGraph = (
  entity: Pick<Entity, "entityId" | "properties">,
  graphFromEntity: BlockGraph,
  processedEntityProperties = new Map<string, Entity<UnknownRecord>>(),
) => {
  const entityPropertiesClone = JSON.parse(JSON.stringify(entity.properties));
  const linkGroups = graphFromEntity.linkGroups.filter(
    ({ sourceEntityId }) => entity.entityId === sourceEntityId,
  );
  for (const linkGroup of linkGroups) {
    if (!isJsonPath(linkGroup.path)) {
      throw new Error(
        `Expected linkGroup.path to be jsonpath, got: ${linkGroup.path}`,
      );
    }
    const entitiesOnPath: Entity<UnknownRecord>[] = [];
    for (const link of linkGroup.links) {
      const linkedEntity = graphFromEntity.linkedEntities.find(
        ({ entityId }) => entityId === link.destinationEntityId,
      );
      if (!linkedEntity) {
        continue;
      }
      if (!processedEntityProperties.has(link.destinationEntityId)) {
        processedEntityProperties.set(
          link.destinationEntityId,
          dataTreeFromEntityGraph(
            linkedEntity,
            graphFromEntity,
            processedEntityProperties,
          ),
        );
      }
      // @todo handle links with an 'index' set – need to put at correct index (checking array size)
      // @todo detect cyclic graphs and stop resolving – won't be serializable as JSON
      entitiesOnPath.push(
        processedEntityProperties.get(link.destinationEntityId)!,
      );
    }

    const propertyPath = pathWithoutLeadingChars(linkGroup.path);

    // @todo we need a way of expressing links to entity in an entity schema, and then check whether it's an array or not
    // for now we will assume it's only supposed to be one if there is only one
    if (entitiesOnPath.length > 1) {
      set(entityPropertiesClone, propertyPath, entitiesOnPath);
    } else {
      set(entityPropertiesClone, propertyPath, entitiesOnPath[0]);
    }
  }

  return entityPropertiesClone;
};

/**
 * Given a map from one set of paths to another, transforms a graph rooted at an entity into a single JS object.
 * @param entity the root entity
 * @param graphFromEntity the graph around the entity, expressed in Block Protocol terms, i.e. linkGroups and linkedEntities
 * @param transformations the transformations used to transform the entity graph to a single JS object
 */
export const mapData = (
  entity: Pick<Entity, "entityId" | "properties">,
  graphFromEntity: BlockGraph,
  transformations: SchemaMap["transformations"],
): JsonObject => {
  const convertedObject: JsonObject = {};
  const sourceTree = dataTreeFromEntityGraph(entity, graphFromEntity);
  for (const [outputKey, transformation] of Object.entries(
    transformations ?? {},
  )) {
    if (transformation?.sourceKey || transformation?.default) {
      set(
        convertedObject,
        outputKey,
        transformation.sourceKey
          ? get(sourceTree, transformation.sourceKey)
          : transformation.default,
      );
    }
  }
  return convertedObject;
};

import { JSONObject } from "blockprotocol";

import { isParsedJsonObject } from "@hashintel/hash-shared/json-utils";
import {
  Entity as BpEntity,
  EntityType as BpEntityType,
} from "@blockprotocol/graph";

import {
  UnknownEntity as ApiEntity,
  EntityType as ApiEntityType,
} from "../graphql/apiTypes.gen";

/**
 * Converts an entity from its GraphQL API representation to its Block Protocol representation:
 * 1. Only provide 'entityId' and 'entityTypeId' at the top level
 * 2. Re-write 'entityId' so that it is a stringified object of the identifiers we need (i.e. to include accountId)
 */
export const convertApiEntityToBpEntity = ({
  accountId,
  entityId,
  entityTypeId,
  properties,
}: Pick<
  ApiEntity,
  "accountId" | "entityId" | "entityTypeId" | "properties"
>): BpEntity => {
  if (entityId.includes("{")) {
    throw new Error(
      `entityId has already been re-written as a stringified object: ${entityId}`,
    );
  }
  return {
    entityId: JSON.stringify({ accountId, entityId, entityTypeId }),
    entityTypeId,
    properties,
  };
};

/**
 * Converts entities from their GraphQL API representation to their Block Protocol representation.
 * @see convertApiEntityToBpEntity
 */
export const convertApiEntitiesToBpEntities = (
  records: Pick<
    ApiEntity,
    "accountId" | "entityId" | "entityTypeId" | "properties"
  >[],
): BpEntity[] => records.map(convertApiEntityToBpEntity);

export type EntityIdentifier = {
  accountId: string;
  entityId: string;
  entityTypeId: string;
};

/**
 * We send blocks an 'entityId' that is a stringified object in {@link convertApiEntityToBpEntity}
 * – this reverses the process so we have the individual fields to use in calling the HASH API.
 *
 * @param stringifiedIdentifier any 'entityId' or equivalent (e.g. sourceEntityId) sent from a block
 */
export function parseEntityIdentifier(
  stringifiedIdentifier: string,
): EntityIdentifier {
  let identifierObject: EntityIdentifier;
  try {
    identifierObject = JSON.parse(stringifiedIdentifier);
  } catch (err) {
    throw new Error(
      `Provided identifier string '${stringifiedIdentifier}' cannot be parsed to JSON: ${err}`,
    );
  }

  if (!identifierObject.accountId) {
    throw new Error(
      `Parsed identifier for Entity does not contain accountId key. Provided identifier: ${JSON.stringify(
        identifierObject,
        undefined,
        2,
      )}`,
    );
  }

  if (!identifierObject.entityId) {
    throw new Error(
      `Parsed identifier for Entity does not contain entityId key. Provided identifier: ${JSON.stringify(
        identifierObject,
        undefined,
        2,
      )}`,
    );
  }

  if (!identifierObject.entityTypeId) {
    throw new Error(
      `Parsed identifier for Entity does not contain entityTypeId key. Provided identifier: ${JSON.stringify(
        identifierObject,
        undefined,
        2,
      )}`,
    );
  }

  return identifierObject;
}

/**
 * Converts an entity type from its GraphQL API representation to its Block Protocol representation:
 * 1. Only provide 'entityTypeId' at the top level
 * 2. Provide the schema under 'schema', not 'properties'
 *
 * N.B. this intentionally does not re-write 'entityTypeId' to include accountId, since types are not sharded,
 * and the 'entityTypeId' is sufficient to identify entity types when calling the HASH API.
 */
export const convertApiEntityTypeToBpEntityType = ({
  entityId,
  entityTypeId,
  properties,
}: Pick<
  ApiEntityType,
  "entityId" | "entityTypeId" | "properties"
>): BpEntityType => {
  if (entityTypeId.includes("{")) {
    throw new Error(
      `entityTypeId has already been re-written as a stringified object: ${entityTypeId}`,
    );
  }
  return {
    entityTypeId: entityId,
    schema: properties,
  };
};

/**
 * Converts entity types from their GraphQL API representation to their Block Protocol representation
 * @see convertApiEntityTypeToBpEntityType
 */
export const convertApiEntityTypesToBpEntityTypes = (
  records: Pick<ApiEntityType, "entityTypeId" | "properties">[],
): BpEntityType[] => records.map(convertApiEntityTypeToBpEntityType);

/**
 * This is a temporary solution to guess a display label for an entity.
 * It will be replaced by a 'labelProperty' in the schema indicating which field to use as the label
 * @see https://blockprotocol.org/docs/spec/graph-service-specification#json-schema-extensions
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

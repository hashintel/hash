import { JSONObject } from "blockprotocol";

import { isParsedJsonObject } from "@hashintel/hash-shared/json-utils";
import { Entity, EntityType } from "@blockprotocol/graph";

/**
 * Rewrites entities or entity types so that their entityId contains
 * @param records
 */
export const rewriteIdentifiers = <T extends Entity | EntityType>(
  records: T[],
): T[] =>
  records.map((record) => {
    if ("entityId" in record) {
      if (record.entityId("{")) {
        throw new Error("Record has already had i");
      }
    }
  });

export type EntityIdentifier = {
  accountId: string;
  entityId: string;
};

export type EntityTypeIdentifier = {
  accountId: string;
  entityTypeId: string;
};

export const parseIdentifiers = <T extends Entity | EntityType[]>(
  records: T[],
): T[] => {};

export function parseIdentifier(params: {
  stringifiedIdentifier: string;
  type: "EntityType";
}): EntityIdentifier;
export function parseIdentifier(params: {
  stringifiedIdentifier: string;
  type: "Entity";
}): EntityTypeIdentifier;
export function parseIdentifier({
  stringifiedIdentifier,
  type = "Entity",
}: {
  stringifiedIdentifier: string;
  type: "Entity" | "EntityType";
}): EntityIdentifier | EntityTypeIdentifier {
  let identifierObject: EntityIdentifier | EntityTypeIdentifier;
  try {
    identifierObject = JSON.parse(stringifiedIdentifier);
  } catch (err) {
    throw new Error(
      `Provided identifier string '${stringifiedIdentifier}' cannot be parsed to JSON: ${err}`,
    );
  }

  if (!identifierObject.accountId) {
    throw new Error(
      `Parsed identifier does not contain accountId key. Provided identifier: ${JSON.stringify(
        identifierObject,
        undefined,
        2,
      )}`,
    );
  }

  if (type === "Entity" && !("entityId" in identifierObject)) {
    throw new Error(
      `Parsed identifier for Entity does not contain entityId key. Provided identifier: ${JSON.stringify(
        identifierObject,
        undefined,
        2,
      )}`,
    );
  }

  if (type === "EntityType" && !("entityTypeId" in identifierObject)) {
    throw new Error(
      `Parsed identifier for EntityTypeId does not contain entityTypeId key. Provided identifier: ${JSON.stringify(
        identifierObject,
        undefined,
        2,
      )}`,
    );
  }

  return identifierObject;
}

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

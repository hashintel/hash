import { Entity as BpEntity, Link as BpLink } from "@blockprotocol/graph";
import {
  Entity,
  extractEntityUuidFromEntityId,
  Subgraph,
  SubgraphRootTypes,
} from "@hashintel/hash-subgraph";
import { getEntityTypeById } from "@hashintel/hash-subgraph/src/stdlib/element/entity-type";
import { getPropertyTypesByBaseUri } from "@hashintel/hash-subgraph/src/stdlib/element/property-type";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";

import {
  Link as ApiLink,
  UnknownEntity as ApiEntity,
} from "../graphql/api-types.gen";

const isObject = (thing: unknown): thing is {} =>
  typeof thing === "object" && thing !== null;

const hasKey = <K extends string, T extends {}>(
  key: K,
  object: T,
): object is T & Record<K, unknown> => key in object;

const hasKeyForString = <K extends string, T extends {}>(
  key: K,
  object: T,
): object is T & Record<K, string> => {
  return hasKey(key, object) && typeof object[key] === "string";
};

export type ApiEntityIdentifier = {
  accountId: string;
  entityId: string;
};

/**
 * Create an entityId that's a stringified object containing the fields we will need later.
 * The re-written entityId is what should be sent to the block with any Entity,
 * including for sourceEntityId, destinationEntityId on links
 */
export const rewriteEntityIdentifier = ({
  accountId,
  entityId,
}: ApiEntityIdentifier) => JSON.stringify({ accountId, entityId });

/**
 * Converts an entity from its GraphQL API representation to its Block Protocol representation:
 * 1. Only provide 'entityId' and 'entityTypeId' at the top level
 * 2. Re-write 'entityId' so that it is a stringified object of the identifiers we need (i.e. to include accountId)
 */
export const convertApiEntityToBpEntity = ({
  entityId,
  entityTypeId,
  properties,
}: Pick<ApiEntity, "entityId" | "entityTypeId" | "properties">): BpEntity => {
  if (entityId.includes("{")) {
    throw new Error(
      `entityId has already been re-written as a stringified object: ${entityId}`,
    );
  }
  return {
    entityId,
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
): BpEntity[] => records.map((record) => convertApiEntityToBpEntity(record));

/**
 * We send blocks an 'entityId' that is a stringified object in {@link convertApiEntityToBpEntity}
 * – this reverses the process so we have the individual fields to use in calling the HASH API.
 *
 * @param stringifiedIdentifier any 'entityId' or equivalent (e.g. sourceEntityId) sent from a block
 */
export function parseEntityIdentifier(
  stringifiedIdentifier: string,
): ApiEntityIdentifier {
  let identifierObject: unknown;
  try {
    identifierObject = JSON.parse(stringifiedIdentifier);
  } catch (err) {
    throw new Error(
      `Provided identifier string '${stringifiedIdentifier}' cannot be parsed to JSON: ${err}`,
    );
  }

  if (!isObject(identifierObject)) {
    throw new Error(
      `Parsed entity identifier is not an object: ${JSON.stringify(
        identifierObject,
      )}`,
    );
  }

  if (!hasKeyForString("accountId", identifierObject)) {
    throw new Error(
      `Parsed identifier for Entity does not contain accountId key. Provided identifier: ${JSON.stringify(
        identifierObject,
        undefined,
        2,
      )}`,
    );
  }

  if (!hasKeyForString("entityId", identifierObject)) {
    throw new Error(
      `Parsed identifier for Entity does not contain entityId key. Provided identifier: ${JSON.stringify(
        identifierObject,
        undefined,
        2,
      )}`,
    );
  }

  return identifierObject;
}

type ApiLinkIdentifier = {
  accountId: string;
  linkId: string;
};

/**
 * Create a linkId that's a stringified object containing the fields we will need later.
 * The re-written linkId is what should be sent to the block with any Link
 */
const rewriteLinkIdentifier = ({ accountId, linkId }: ApiLinkIdentifier) =>
  JSON.stringify({ accountId, linkId });

/**
 * We send blocks a 'linkId' that is a stringified object in {@link convertApiLinkToBpLink}
 * – this reverses the process so we have the individual fields to use in calling the HASH API.
 *
 * @param stringifiedLinkId a linkId' or equivalent (e.g. sourceEntityId) sent from a block
 */
export const parseLinkIdentifier = (
  stringifiedLinkId: string,
): ApiLinkIdentifier => {
  let identifierObject: unknown;
  try {
    identifierObject = JSON.parse(stringifiedLinkId);
  } catch (err) {
    throw new Error(
      `Provided identifier string '${stringifiedLinkId}' cannot be parsed to JSON: ${err}`,
    );
  }

  if (!isObject(identifierObject)) {
    throw new Error(
      `Parsed link identifier is not an object: ${JSON.stringify(
        identifierObject,
      )}`,
    );
  }

  if (!hasKeyForString("accountId", identifierObject)) {
    throw new Error(
      `Parsed identifier for Link does not contain accountId key. Provided identifier: ${JSON.stringify(
        identifierObject,
        undefined,
        2,
      )}`,
    );
  }

  if (!hasKeyForString("linkId", identifierObject)) {
    throw new Error(
      `Parsed identifier for Link does not contain linkId key. Provided identifier: ${JSON.stringify(
        identifierObject,
        undefined,
        2,
      )}`,
    );
  }

  return identifierObject;
};

/**
 * Converts a Link from its GraphQL API representation to its Block Protocol representation,
 * by re-writing all of linkId, sourceEntityId and sourceDestinationId so that they are
 * stringified objects containing the identifiers we need (i.e. to include accountId)
 */
export const convertApiLinkToBpLink = ({
  linkId,
  destinationAccountId,
  destinationEntityId,
  sourceAccountId,
  sourceEntityId,
  path,
  index,
}: Pick<
  ApiLink,
  | "linkId"
  | "destinationAccountId"
  | "destinationEntityId"
  | "sourceAccountId"
  | "sourceEntityId"
  | "index"
  | "path"
>): BpLink => {
  if (linkId.includes("{")) {
    throw new Error(
      `linkId has already been re-written as a stringified object: ${linkId}`,
    );
  }

  if (sourceEntityId.includes("{")) {
    throw new Error(
      `sourceEntityId has already been re-written as a stringified object: ${sourceEntityId}`,
    );
  }

  if (destinationEntityId.includes("{")) {
    throw new Error(
      `destinationEntityId has already been re-written as a stringified object: ${destinationEntityId}`,
    );
  }

  return {
    linkId: rewriteLinkIdentifier({ accountId: sourceAccountId, linkId }),
    sourceEntityId: rewriteEntityIdentifier({
      accountId: sourceAccountId,
      entityId: sourceEntityId,
    }),
    destinationEntityId: rewriteEntityIdentifier({
      accountId: destinationAccountId,
      entityId: destinationEntityId,
    }),
    path,
    index,
  };
};

/**
 * Converts links from their GraphQL API representation to their Block Protocol representation.
 * @see convertApiLinkToBpLink
 */
export const convertApiLinksToBpLinks = (records: ApiLink[]): BpLink[] =>
  records.map((record) => convertApiLinkToBpLink(record));

type ApiLinkedAggregationIdentifier = {
  accountId: string;
  aggregationId: string;
};

/**
 * We send blocks an 'aggregationId' that is a stringified object in {@link convertApiLinkedAggregationToBpLinkedAggregation}
 * – this reverses the process so we have the individual fields to use in calling the HASH API.
 *
 * @param stringifiedLinkId a aggregationId' or equivalent (e.g. sourceEntityId) sent from a block
 */
export const parseLinkedAggregationIdentifier = (
  stringifiedLinkId: string,
): ApiLinkedAggregationIdentifier => {
  let identifierObject: unknown;
  try {
    identifierObject = JSON.parse(stringifiedLinkId);
  } catch (err) {
    throw new Error(
      `Provided identifier string '${stringifiedLinkId}' cannot be parsed to JSON: ${err}`,
    );
  }

  if (!isObject(identifierObject)) {
    throw new Error(
      `Parsed aggregation identifier is not an object: ${JSON.stringify(
        identifierObject,
      )}`,
    );
  }

  if (!hasKeyForString("accountId", identifierObject)) {
    throw new Error(
      `Parsed identifier for LinkedAggregation does not contain accountId key. Provided identifier: ${JSON.stringify(
        identifierObject,
        undefined,
        2,
      )}`,
    );
  }

  if (!hasKeyForString("aggregationId", identifierObject)) {
    throw new Error(
      `Parsed identifier for LinkedAggregation does not contain aggregationId key. Provided identifier: ${JSON.stringify(
        identifierObject,
        undefined,
        2,
      )}`,
    );
  }

  return identifierObject;
};

/**
 * Generate a display label for an entity
 * Prefers the BP-specified labelProperty if it exists.
 * @see https://blockprotocol.org/docs/spec/graph-service-specification#json-schema-extensions
 */
export const generateEntityLabel = (
  entitySubgraph:
    | Subgraph<SubgraphRootTypes["entity"]>
    | Partial<{ entityId: string; properties: any }>,
  entity?: Entity,
): string => {
  /**
   * @todo - this return type is only added to allow for incremental migration. It should be removed
   *   https://app.asana.com/0/0/1203157172269854/f
   */
  if (!("roots" in entitySubgraph)) {
    throw new Error("expected Subgraph but got a deprecated response type");
  }

  const entityToLabel = entity ?? getRoots(entitySubgraph)[0]!;

  const getFallbackLabel = () => {
    // fallback to the entity type and a few characters of the entityUuid
    const entityId = entityToLabel.metadata.editionId.baseId;

    const entityType = getEntityTypeById(
      entitySubgraph,
      entityToLabel.metadata.entityTypeId,
    );
    const entityTypeName = entityType?.schema.title ?? "Entity";

    return `${entityTypeName}-${extractEntityUuidFromEntityId(entityId).slice(
      0,
      5,
    )}`;
  };

  const getFallbackIfNotString = (val: any) => {
    if (!val || typeof val !== "string") {
      return getFallbackLabel();
    }

    return val;
  };

  // fallback to some likely display name properties
  const options = [
    "name",
    "preferred name",
    "display name",
    "title",
    "shortname",
  ];

  const propertyTypes: { title?: string; propertyTypeBaseUri: string }[] =
    Object.keys(entityToLabel.properties).map((propertyTypeBaseUri) => {
      /** @todo - pick the latest version rather than first element? */
      const [propertyType] = getPropertyTypesByBaseUri(
        entitySubgraph,
        propertyTypeBaseUri,
      );

      return propertyType
        ? {
            title: propertyType.schema.title.toLowerCase(),
            propertyTypeBaseUri,
          }
        : {
            title: undefined,
            propertyTypeBaseUri,
          };
    });

  for (const option of options) {
    const found = propertyTypes.find(({ title }) => title === option);

    if (found) {
      return getFallbackIfNotString(
        entityToLabel.properties[found.propertyTypeBaseUri],
      );
    }
  }

  return getFallbackLabel();
};

import { JSONObject } from "blockprotocol";

import { isParsedJsonObject } from "@hashintel/hash-shared/json-utils";
import {
  Entity as BpEntity,
  EntityType as BpEntityType,
  Link as BpLink,
  LinkedAggregation as BpLinkedAggregation,
  LinkedAggregationDefinition as BpLinkedAggregationDefinition,
} from "@blockprotocol/graph";

import {
  UnknownEntity as ApiEntity,
  EntityType as ApiEntityType,
  Link as ApiLink,
  LinkedAggregation as ApiLinkedAggregation,
} from "../graphql/apiTypes.gen";

export type ApiEntityIdentifier = {
  accountId: string;
  entityId: string;
  entityTypeId?: string;
};

/**
 * Create an entityId that's a stringified object containing the fields we will need later.
 * The re-written entityId is what should be sent to the block with any Entity,
 * including for sourceEntityId, destinationEntityId on links
 */
export const rewriteEntityIdentifier = ({
  accountId,
  entityId,
  entityTypeId,
}: ApiEntityIdentifier) =>
  JSON.stringify({ accountId, entityId, entityTypeId });

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
    entityId: rewriteEntityIdentifier({ accountId, entityId, entityTypeId }),
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

/**
 * We send blocks an 'entityId' that is a stringified object in {@link convertApiEntityToBpEntity}
 * – this reverses the process so we have the individual fields to use in calling the HASH API.
 *
 * @param stringifiedIdentifier any 'entityId' or equivalent (e.g. sourceEntityId) sent from a block
 */
export function parseEntityIdentifier(
  stringifiedIdentifier: string,
): ApiEntityIdentifier {
  let identifierObject: ApiEntityIdentifier;
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
  let identifierObject: ApiLinkIdentifier;
  try {
    identifierObject = JSON.parse(stringifiedLinkId);
  } catch (err) {
    throw new Error(
      `Provided identifier string '${stringifiedLinkId}' cannot be parsed to JSON: ${err}`,
    );
  }

  if (!identifierObject.accountId) {
    throw new Error(
      `Parsed identifier for Link does not contain accountId key. Provided identifier: ${JSON.stringify(
        identifierObject,
        undefined,
        2,
      )}`,
    );
  }

  if (!identifierObject.linkId) {
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

  if (destinationAccountId.includes("{")) {
    throw new Error(
      `destinationAccountId has already been re-written as a stringified object: ${destinationAccountId}`,
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
  records.map(convertApiLinkToBpLink);

type ApiLinkedAggregationIdentifier = {
  accountId: string;
  aggregationId: string;
};

/**
 * Create a aggregationId that's a stringified object containing the fields we will need later.
 * The re-written aggregationId is what should be sent to the block with any Link
 */
const rewriteLinkedAggregationIdentifier = ({
  accountId,
  aggregationId,
}: ApiLinkedAggregationIdentifier) =>
  JSON.stringify({ accountId, aggregationId });

/**
 * We send blocks an 'aggregationId' that is a stringified object in {@link convertApiLinkedAggregationToBpLinkedAggregation}
 * – this reverses the process so we have the individual fields to use in calling the HASH API.
 *
 * @param stringifiedLinkId a aggregationId' or equivalent (e.g. sourceEntityId) sent from a block
 */
export const parseLinkedAggregationIdentifier = (
  stringifiedLinkId: string,
): ApiLinkedAggregationIdentifier => {
  let identifierObject: ApiLinkedAggregationIdentifier;
  try {
    identifierObject = JSON.parse(stringifiedLinkId);
  } catch (err) {
    throw new Error(
      `Provided identifier string '${stringifiedLinkId}' cannot be parsed to JSON: ${err}`,
    );
  }

  if (!identifierObject.accountId) {
    throw new Error(
      `Parsed identifier for LinkedAggregation does not contain accountId key. Provided identifier: ${JSON.stringify(
        identifierObject,
        undefined,
        2,
      )}`,
    );
  }

  if (!identifierObject.aggregationId) {
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

type MinimalApiLinkedAggregation = Pick<
  ApiLinkedAggregation,
  "aggregationId" | "sourceAccountId" | "sourceEntityId" | "operation" | "path"
>;

export function convertApiLinkedAggregationToBpLinkedAggregation(
  linkedAggregation: MinimalApiLinkedAggregation & { results: never },
): BpLinkedAggregationDefinition;

export function convertApiLinkedAggregationToBpLinkedAggregation(
  linkedAggregation: MinimalApiLinkedAggregation & {
    results: Pick<
      ApiEntity,
      "accountId" | "entityId" | "entityTypeId" | "properties"
    >[];
  },
): BpLinkedAggregation;
/**
 * Converts a LinkedAggregation from its GraphQL API representation to its Block Protocol representation,
 * by re-writing all of aggregationId, sourceEntityId and sourceDestinationId so that they are
 * stringified objects containing the identifiers we need (i.e. to include accountId)
 */
export function convertApiLinkedAggregationToBpLinkedAggregation(
  linkedAggregation:
    | (MinimalApiLinkedAggregation & { results: never })
    | (MinimalApiLinkedAggregation & {
        results: Pick<
          ApiEntity,
          "accountId" | "entityId" | "entityTypeId" | "properties"
        >[];
      }),
): BpLinkedAggregation | BpLinkedAggregationDefinition {
  const { aggregationId, sourceAccountId, sourceEntityId, operation, path } =
    linkedAggregation;
  if (aggregationId.includes("{")) {
    throw new Error(
      `aggregationId has already been re-written as a stringified object: ${aggregationId}`,
    );
  }

  if (sourceEntityId.includes("{")) {
    throw new Error(
      `sourceEntityId has already been re-written as a stringified object: ${sourceEntityId}`,
    );
  }

  return {
    aggregationId: rewriteLinkedAggregationIdentifier({
      accountId: sourceAccountId,
      aggregationId,
    }),
    sourceEntityId: rewriteEntityIdentifier({
      accountId: sourceAccountId,
      entityId: sourceEntityId,
    }),
    path,
    operation: operation as BpLinkedAggregation["operation"],
    results:
      "results" in linkedAggregation
        ? convertApiEntitiesToBpEntities(linkedAggregation.results)
        : undefined,
  };
}

/**
 * Converts links from their GraphQL API representation to their Block Protocol representation.
 * @see convertApiLinkedAggregationToBpLinkedAggregation
 */
export const convertApiLinkedAggregationsToBpLinkedAggregations = (
  records: ApiLinkedAggregation[],
): BpLinkedAggregation[] =>
  records.map(convertApiLinkedAggregationToBpLinkedAggregation);

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
  records: Pick<ApiEntityType, "entityId" | "entityTypeId" | "properties">[],
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

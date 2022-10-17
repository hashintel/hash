import {
  Entity as BpEntity,
  EntityType as BpEntityType,
  Link as BpLink,
  LinkGroup as BpLinkGroup,
  LinkedAggregation as BpLinkedAggregation,
  LinkedAggregationDefinition as BpLinkedAggregationDefinition,
  Entity,
} from "@blockprotocol/graph";
import { EntityResponse } from "../components/hooks/blockProtocolFunctions/knowledge/knowledge-shim";

import {
  UnknownEntity as ApiEntity,
  DeprecatedEntityType as ApiEntityType,
  Link as ApiLink,
  LinkGroup as ApiLinkGroup,
  LinkedAggregation as ApiLinkedAggregation,
} from "../graphql/apiTypes.gen";

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
    entityId: rewriteEntityIdentifier({ accountId, entityId }),
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

export const convertApiLinkGroupToBpLinkGroup = (
  linkGroup: ApiLinkGroup,
): BpLinkGroup => {
  const { sourceAccountId, sourceEntityId, links, ...rest } = linkGroup;

  if (sourceEntityId.includes("{")) {
    throw new Error(
      `sourceEntityId has already been re-written as a stringified object: ${sourceEntityId}`,
    );
  }

  return {
    sourceEntityId: rewriteEntityIdentifier({
      accountId: sourceAccountId,
      entityId: sourceEntityId,
    }),
    links: convertApiLinksToBpLinks(links),
    ...rest,
  };
};

export const convertApiLinkGroupsToBpLinkGroups = (
  linkGroups: ApiLinkGroup[],
): BpLinkGroup[] =>
  linkGroups.map((record) => convertApiLinkGroupToBpLinkGroup(record));

type MinimalApiLinkedAggregation = Pick<
  ApiLinkedAggregation,
  "aggregationId" | "sourceAccountId" | "sourceEntityId" | "operation" | "path"
>;

export function convertApiLinkedAggregationToBpLinkedAggregation(
  linkedAggregation: MinimalApiLinkedAggregation & {
    results: Pick<
      ApiEntity,
      "accountId" | "entityId" | "entityTypeId" | "properties"
    >[];
  },
): BpLinkedAggregation;

export function convertApiLinkedAggregationToBpLinkedAggregation(
  linkedAggregation: MinimalApiLinkedAggregation,
): BpLinkedAggregationDefinition;

/**
 * Converts a LinkedAggregation from its GraphQL API representation to its Block Protocol representation,
 * by re-writing all of aggregationId, sourceEntityId and sourceDestinationId so that they are
 * stringified objects containing the identifiers we need (i.e. to include accountId)
 */
export function convertApiLinkedAggregationToBpLinkedAggregation(
  linkedAggregation:
    | (MinimalApiLinkedAggregation & {
        results: Pick<
          ApiEntity,
          "accountId" | "entityId" | "entityTypeId" | "properties"
        >[];
      })
    | MinimalApiLinkedAggregation,
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
      "results" in linkedAggregation && linkedAggregation.results
        ? convertApiEntitiesToBpEntities(linkedAggregation.results)
        : undefined,
  };
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
  properties,
}: Pick<ApiEntityType, "entityId" | "properties">): BpEntityType => {
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
  records: Pick<ApiEntityType, "entityId" | "properties">[],
): BpEntityType[] =>
  records.map((record) => convertApiEntityTypeToBpEntityType(record));

/**
 * Generate a display label for an entity
 * Prefers the BP-specified labelProperty if it exists.
 * @see https://blockprotocol.org/docs/spec/graph-service-specification#json-schema-extensions
 */
export const generateEntityLabel = (
  entity: Entity | EntityResponse,
  schema?: { labelProperty?: unknown; title?: unknown },
): string => {
  // if the schema has a labelProperty set, prefer that
  const labelProperty = schema?.labelProperty;
  if (
    typeof labelProperty === "string" &&
    typeof entity.properties[labelProperty] === "string" &&
    entity.properties[labelProperty]
  ) {
    return entity.properties[labelProperty] as string;
  }

  // fallback to some likely display name properties
  const options = [
    "name",
    "preferred name",
    "display name",
    "title",
    "shortname",
  ];

  /** @todo refactor the following section to make it more readable */
  const propertyTypes: { title?: string; propertyTypeId: string }[] =
    Object.keys(entity.properties).map((propertyTypeId) => ({
      propertyTypeId,
      title: (
        entity as EntityResponse
      ).entityTypeRootedSubgraph.referencedPropertyTypes
        .find((item) => item.propertyTypeId.startsWith(propertyTypeId))
        ?.propertyType.title.toLowerCase(),
    }));

  for (const option of options) {
    const found = propertyTypes.find(({ title }) => title === option);

    if (found) {
      return entity.properties[found.propertyTypeId];
    }
  }

  // fallback to the entity type and a few characters of the entityId
  let entityId = entity.entityId;
  try {
    // in case this entityId is a stringified JSON object, extract the real entityId from it
    ({ entityId } = parseEntityIdentifier(entityId));
  } catch {
    // entityId was not a stringified object, it was already the real entityId
  }

  const entityTypeName = schema?.title ?? "Entity";

  return `${entityTypeName}-${entityId.slice(0, 5)}`;
};

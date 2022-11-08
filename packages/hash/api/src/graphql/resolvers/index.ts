import { JSONObjectResolver } from "graphql-scalars";

import { Entity } from "../apiTypes.gen";

import {
  aggregateEntity,
  createEntity,
  entity,
  entities,
  entityFields,
  updateEntity,
  transferEntity,
} from "./entity";
import { createLink } from "./link/createLink";
import { deleteLink } from "./link/deleteLink";
import { blocks, blockProperties, blockLinkedEntities } from "./block";
import {
  page,
  pageProperties,
  updatePage,
  updatePageContents,
  searchPages,
  pageLinkedEntities,
} from "./pages";
import { embedCode } from "./embed";
import {
  getImpliedEntityHistory,
  getImpliedEntityVersion,
} from "./entity/impliedHistory";

import { me } from "./knowledge/user/me";
import { isShortnameTaken } from "./knowledge/user/isShortnameTaken";
import { deprecatedCreateEntityType } from "./entityType/createEntityType";
import { SYSTEM_TYPES, SystemType } from "../../types/entityTypes";
import { entityTypeTypeFields } from "./entityType/entityTypeTypeFields";
import { entityTypeInheritance } from "./entityType/entityTypeInheritance";
import { deprecatedGetAccountEntityTypes } from "./entityType/getAccountEntityTypes";
import { deprecatedGetEntityType } from "./entityType/getEntityType";
import { fileFields } from "./file";
import { requestFileUpload } from "./file/requestFileUpload";
import { createFileFromLink } from "./file/createFileFromLink";
import { loggedIn } from "./middlewares/loggedIn";
import { loggedInAndSignedUp } from "./middlewares/loggedInAndSignedUp";
import { canAccessAccount } from "./middlewares/canAccessAccount";
import { deprecatedUpdateEntityType } from "./entityType/updateEntityType";
import { deleteLinkedAggregation } from "./linkedAggregation/deleteLinkedAggregation";
import { updateLinkedAggregationOperation } from "./linkedAggregation/updateLinkedAggregationOperation";
import { createLinkedAggregation } from "./linkedAggregation/createLinkedAggregation";
import { linkedAggregationResults } from "./linkedAggregation/linkedAggregationResults";
import { pageSearchResultConnection } from "./paginationConnection/pageSearchResultConnection";
import {
  executeDemoTask,
  executeGithubSpecTask,
  executeGithubCheckTask,
  executeGithubDiscoverTask,
  executeGithubReadTask,
} from "./taskExecutor";
import { getLink } from "./link/getLink";
import { getLinkedAggregation } from "./linkedAggregation/getLinkedAggregation";
import { getAllLatestDataTypes, getDataType } from "./ontology/data-type";
import {
  createPropertyType,
  getAllLatestPropertyTypes,
  getPropertyType,
  updatePropertyType,
} from "./ontology/property-type";
import {
  createLinkType,
  getAllLatestLinkTypes,
  getLinkType,
  updateLinkType,
} from "./ontology/link-type";

import {
  createEntityType,
  getAllLatestEntityTypes,
  getEntityType,
  updateEntityType,
} from "./ontology/entity-type";
import {
  updatePersistedPageContents,
  persistedPageContents,
} from "./knowledge/page";
import {
  createPersistedPage,
  persistedPage,
  persistedPages,
  parentPersistedPage,
  persistedPageComments,
} from "./knowledge/page/page";
import { createPersistedComment } from "./knowledge/comment/comment";
import { persistedBlocks } from "./knowledge/block/block";
import { getBlockProtocolBlocks } from "./blockprotocol/getBlock";
import {
  createPersistedEntity,
  getPersistedEntity,
  getAllLatestPersistedEntities,
  updatePersistedEntity,
} from "./knowledge/entity/entity";
import { UnresolvedPersistedEntityGQL } from "./knowledge/model-mapping";
import {
  createPersistedLink,
  deletePersistedLink,
  outgoingPersistedLinks,
} from "./knowledge/link/link";
import { setParentPersistedPage } from "./knowledge/page/set-parent-page";
import { updatePersistedPage } from "./knowledge/page/update-page";
import { persistedCommentHasText } from "./knowledge/comment/has-text";
import { persistedCommentTextUpdatedAt } from "./knowledge/comment/text-updated-at";
import { persistedCommentReplies } from "./knowledge/comment/replies";
import { persistedCommentParent } from "./knowledge/comment/parent";
import { persistedCommentAuthor } from "./knowledge/comment/author";
import { resolvePersistedComment } from "./knowledge/comment/resolve";
import { deletePersistedComment } from "./knowledge/comment/delete";
import { updatePersistedCommentText } from "./knowledge/comment/update-text";
import { blockChildEntity } from "./knowledge/block/data-entity";
import { loggedInAndSignedUpHashInstanceAdmin } from "./middlewares/loggedInAndSignedUpHashInstanceAdmin";
import { createUser } from "./knowledge/user/createUser";

/**
 * @todo: derive these from the statically declared system type names
 * @see https://app.asana.com/0/1202805690238892/1203063463721797/f
 */
const systemEntityGQLTypeNames = ["PersistedPage", "PersistedBlock"] as const;

type SystemEntityGQLTypeName = typeof systemEntityGQLTypeNames[number];

const isSystemEntityGQLTypeName = (
  name: string,
): name is SystemEntityGQLTypeName =>
  systemEntityGQLTypeNames.includes(name as SystemEntityGQLTypeName);

/** @todo - Refactor the names of these https://app.asana.com/0/1200211978612931/1203234667392169/f */
export const resolvers = {
  Query: {
    // Logged in and signed up users only,
    aggregateEntity: loggedInAndSignedUp(aggregateEntity),
    blocks: loggedInAndSignedUp(blocks),
    deprecatedGetAccountEntityTypes: loggedInAndSignedUp(
      deprecatedGetAccountEntityTypes,
    ),
    getBlockProtocolBlocks,
    entity: loggedInAndSignedUp(entity),
    entities: loggedInAndSignedUp(canAccessAccount(entities)),
    deprecatedGetEntityType: loggedInAndSignedUp(deprecatedGetEntityType),
    getLink: loggedInAndSignedUp(getLink),
    getLinkedAggregation: loggedInAndSignedUp(getLinkedAggregation),
    page: canAccessAccount(page),
    getImpliedEntityHistory: loggedInAndSignedUp(getImpliedEntityHistory),
    getImpliedEntityVersion: loggedInAndSignedUp(getImpliedEntityVersion),
    searchPages: loggedInAndSignedUp(searchPages),
    // Logged in users only
    me: loggedIn(me),
    // Any user
    isShortnameTaken,
    embedCode,
    pageSearchResultConnection,
    // Ontology
    getAllLatestDataTypes: loggedInAndSignedUp(getAllLatestDataTypes),
    getDataType: loggedInAndSignedUp(getDataType),
    getAllLatestPropertyTypes: loggedInAndSignedUp(getAllLatestPropertyTypes),
    getPropertyType: loggedInAndSignedUp(getPropertyType),
    getAllLatestLinkTypes: loggedInAndSignedUp(getAllLatestLinkTypes),
    getLinkType: loggedInAndSignedUp(getLinkType),
    getAllLatestEntityTypes: loggedInAndSignedUp(getAllLatestEntityTypes),
    getEntityType: loggedInAndSignedUp(getEntityType),
    // Knowledge
    persistedPage,
    persistedPages: loggedInAndSignedUp(persistedPages),
    persistedPageComments: loggedInAndSignedUp(persistedPageComments),
    persistedBlocks: loggedInAndSignedUp(persistedBlocks),
    getPersistedEntity: loggedInAndSignedUp(getPersistedEntity),
    getAllLatestPersistedEntities: loggedInAndSignedUp(
      getAllLatestPersistedEntities,
    ),
    /** @todo - delete this - https://app.asana.com/0/0/1203157172269854/f */
    outgoingPersistedLinks: loggedInAndSignedUp(outgoingPersistedLinks),
  },

  Mutation: {
    // Logged in and signed up users only
    createEntity: loggedInAndSignedUp(createEntity),
    createLink: loggedInAndSignedUp(createLink),
    deleteLink: loggedInAndSignedUp(deleteLink),
    createLinkedAggregation: loggedInAndSignedUp(createLinkedAggregation),
    updateLinkedAggregationOperation: loggedInAndSignedUp(
      updateLinkedAggregationOperation,
    ),
    deleteLinkedAggregation: loggedInAndSignedUp(deleteLinkedAggregation),
    deprecatedCreateEntityType: loggedInAndSignedUp(deprecatedCreateEntityType),
    createFileFromLink: loggedInAndSignedUp(createFileFromLink),
    transferEntity: loggedInAndSignedUp(transferEntity),
    updateEntity: loggedInAndSignedUp(updateEntity),
    deprecatedUpdateEntityType: loggedInAndSignedUp(deprecatedUpdateEntityType),
    updatePage: loggedInAndSignedUp(updatePage),
    updatePageContents: loggedInAndSignedUp(updatePageContents),
    updatePersistedPageContents: loggedInAndSignedUp(
      updatePersistedPageContents,
    ),
    requestFileUpload: loggedInAndSignedUp(requestFileUpload),
    // Task execution
    executeDemoTask,
    executeGithubSpecTask,
    executeGithubCheckTask,
    executeGithubDiscoverTask: loggedInAndSignedUp(executeGithubDiscoverTask),
    executeGithubReadTask: loggedInAndSignedUp(executeGithubReadTask),
    // Ontology
    createPropertyType: loggedInAndSignedUp(createPropertyType),
    updatePropertyType: loggedInAndSignedUp(updatePropertyType),
    createLinkType: loggedInAndSignedUp(createLinkType),
    updateLinkType: loggedInAndSignedUp(updateLinkType),
    createEntityType: loggedInAndSignedUp(createEntityType),
    updateEntityType: loggedInAndSignedUp(updateEntityType),
    // Knowledge
    createPersistedEntity: loggedInAndSignedUp(createPersistedEntity),
    updatePersistedEntity: loggedIn(updatePersistedEntity),
    createPersistedLink: loggedInAndSignedUp(createPersistedLink),
    deletePersistedLink: loggedInAndSignedUp(deletePersistedLink),
    createPersistedPage: loggedInAndSignedUp(createPersistedPage),
    setParentPersistedPage: loggedInAndSignedUp(setParentPersistedPage),
    updatePersistedPage: loggedInAndSignedUp(updatePersistedPage),
    createPersistedComment: loggedInAndSignedUp(createPersistedComment),
    resolvePersistedComment: loggedInAndSignedUp(resolvePersistedComment),
    deletePersistedComment: loggedInAndSignedUp(deletePersistedComment),
    updatePersistedCommentText: loggedInAndSignedUp(updatePersistedCommentText),
    // HASH instance admin mutations
    createUser: loggedInAndSignedUpHashInstanceAdmin(createUser),
  },

  JSONObject: JSONObjectResolver,

  Block: {
    properties:
      blockProperties /** @todo: remove this resolver as it is deprecated */,
    ...blockLinkedEntities,
  },

  Page: {
    properties:
      pageProperties /** @todo: remove this resolver as it is deprecated */,
    ...pageLinkedEntities,
  },

  FileProperties: {
    url: fileFields.url,
  },

  UnknownEntity: {
    properties: entityFields.properties,
  },

  Entity: {
    __resolveType({ entityTypeName }: Entity) {
      // @todo this should also check if the type is in the HASH account
      //    otherwise it'll catch User, Org etc types in other accounts
      //    which may have a different structure to the HASH one.
      //    should also extract this check (e.g. to src/types/entityTypes).
      if (SYSTEM_TYPES.includes(entityTypeName as SystemType)) {
        return entityTypeName;
      }
      return "UnknownEntity";
    },
    history: entityFields.history,
    linkGroups: entityFields.linkGroups,
    linkedEntities: entityFields.linkedEntities,
    linkedAggregations: entityFields.linkedAggregations,
  },

  LinkedAggregation: {
    results: linkedAggregationResults,
  },

  DeprecatedEntityType: {
    entityType: entityTypeTypeFields.entityType,
    entityTypeId: entityTypeTypeFields.entityTypeId,
    entityTypeName: entityTypeTypeFields.entityTypeName,
    entityTypeVersionId: entityTypeTypeFields.entityTypeVersionId,

    ...entityTypeInheritance,
  },

  Account: {
    __resolveType({ entityTypeName }: Entity) {
      return entityTypeName;
    },
  },

  // New knowledge field resolvers

  PersistedEntity: {
    /**
     * Determines whether a `PersistedEntity` instance should be treated as a
     * system GQL type definition (for example as a `PersistedPage`), or
     * whether to treat it is an `UnknownPersistedEntity`.
     */
    __resolveType: ({
      systemTypeName,
    }: UnresolvedPersistedEntityGQL):
      | SystemEntityGQLTypeName
      | "UnknownPersistedEntity" => {
      const systemEntityGQLTypeName = systemTypeName
        ? `Persisted${systemTypeName.split(" ").join("")}`
        : undefined;

      return systemEntityGQLTypeName &&
        isSystemEntityGQLTypeName(systemEntityGQLTypeName)
        ? systemEntityGQLTypeName
        : "UnknownPersistedEntity";
    },
  },

  PersistedPage: {
    contents: persistedPageContents,
    parentPage: parentPersistedPage,
  },

  PersistedComment: {
    hasText: persistedCommentHasText,
    textUpdatedAt: persistedCommentTextUpdatedAt,
    parent: persistedCommentParent,
    author: persistedCommentAuthor,
    replies: persistedCommentReplies,
  },

  PersistedBlock: {
    blockChildEntity,
  },

  /**
   * @todo Add Entity.linkedEntities field resolver for resolving linked entities
   *   PersistedEntity: { linkedEntities .. }
   *   see https://app.asana.com/0/0/1203057486837594/f
   */
};

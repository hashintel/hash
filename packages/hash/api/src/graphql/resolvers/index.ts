import { JSONObjectResolver } from "graphql-scalars";

import { Entity } from "../apiTypes.gen";
import { createLink } from "./link/createLink";
import { deleteLink } from "./link/deleteLink";
import { embedCode } from "./embed";

import { me } from "./knowledge/user/me";
import { isShortnameTaken } from "./knowledge/user/is-shortname-taken";
import { deprecatedCreateEntityType } from "./entityType/createEntityType";
import { entityTypeTypeFields } from "./entityType/entityTypeTypeFields";
import { entityTypeInheritance } from "./entityType/entityTypeInheritance";
import { deprecatedGetAccountEntityTypes } from "./entityType/getAccountEntityTypes";
import { deprecatedGetEntityType } from "./entityType/getEntityType";
import { fileFields } from "./file";
import { requestFileUpload } from "./file/requestFileUpload";
import { createFileFromLink } from "./file/createFileFromLink";
import { loggedIn } from "./middlewares/loggedIn";
import { loggedInAndSignedUp } from "./middlewares/loggedInAndSignedUp";
import { deprecatedUpdateEntityType } from "./entityType/updateEntityType";
import { deleteLinkedAggregation } from "./linkedAggregation/deleteLinkedAggregation";
import { updateLinkedAggregationOperation } from "./linkedAggregation/updateLinkedAggregationOperation";
import { createLinkedAggregation } from "./linkedAggregation/createLinkedAggregation";
import { linkedAggregationResults } from "./linkedAggregation/linkedAggregationResults";
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
  createEntityWithMetadata,
  getEntityWithMetadata,
  getAllLatestEntitiesWithMetadata,
  updateEntityWithMetadata,
} from "./knowledge/entity/entity";
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
import { createUser } from "./knowledge/user/create-user";
import { createOrg } from "./knowledge/org/create-org";

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
    deprecatedGetAccountEntityTypes: loggedInAndSignedUp(
      deprecatedGetAccountEntityTypes,
    ),
    getBlockProtocolBlocks,
    deprecatedGetEntityType: loggedInAndSignedUp(deprecatedGetEntityType),
    getLink: loggedInAndSignedUp(getLink),
    getLinkedAggregation: loggedInAndSignedUp(getLinkedAggregation),
    // Logged in users only
    me: loggedIn(me),
    // Any user
    isShortnameTaken,
    embedCode,
    // Ontology
    getAllLatestDataTypes: loggedInAndSignedUp(getAllLatestDataTypes),
    getDataType: loggedInAndSignedUp(getDataType),
    getAllLatestPropertyTypes: loggedInAndSignedUp(getAllLatestPropertyTypes),
    getPropertyType: loggedInAndSignedUp(getPropertyType),
    getAllLatestEntityTypes: loggedInAndSignedUp(getAllLatestEntityTypes),
    getEntityType: loggedInAndSignedUp(getEntityType),
    // Knowledge
    persistedPage,
    persistedPages: loggedInAndSignedUp(persistedPages),
    persistedPageComments: loggedInAndSignedUp(persistedPageComments),
    persistedBlocks: loggedInAndSignedUp(persistedBlocks),
    getEntityWithMetadata: loggedInAndSignedUp(getEntityWithMetadata),
    getAllLatestEntitiesWithMetadata: loggedInAndSignedUp(
      getAllLatestEntitiesWithMetadata,
    ),
  },

  Mutation: {
    // Logged in and signed up users only
    createLink: loggedInAndSignedUp(createLink),
    deleteLink: loggedInAndSignedUp(deleteLink),
    createLinkedAggregation: loggedInAndSignedUp(createLinkedAggregation),
    updateLinkedAggregationOperation: loggedInAndSignedUp(
      updateLinkedAggregationOperation,
    ),
    deleteLinkedAggregation: loggedInAndSignedUp(deleteLinkedAggregation),
    deprecatedCreateEntityType: loggedInAndSignedUp(deprecatedCreateEntityType),
    createFileFromLink: loggedInAndSignedUp(createFileFromLink),
    deprecatedUpdateEntityType: loggedInAndSignedUp(deprecatedUpdateEntityType),
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
    createEntityType: loggedInAndSignedUp(createEntityType),
    updateEntityType: loggedInAndSignedUp(updateEntityType),
    // Knowledge
    createEntityWithMetadata: loggedInAndSignedUp(createEntityWithMetadata),
    updateEntityWithMetadata: loggedIn(updateEntityWithMetadata),
    createPersistedPage: loggedInAndSignedUp(createPersistedPage),
    setParentPersistedPage: loggedInAndSignedUp(setParentPersistedPage),
    updatePersistedPage: loggedInAndSignedUp(updatePersistedPage),
    createPersistedComment: loggedInAndSignedUp(createPersistedComment),
    resolvePersistedComment: loggedInAndSignedUp(resolvePersistedComment),
    deletePersistedComment: loggedInAndSignedUp(deletePersistedComment),
    updatePersistedCommentText: loggedInAndSignedUp(updatePersistedCommentText),
    // HASH instance admin mutations
    createUser: loggedInAndSignedUpHashInstanceAdmin(createUser),
    createOrg: loggedInAndSignedUpHashInstanceAdmin(createOrg),
  },

  JSONObject: JSONObjectResolver,

  FileProperties: {
    url: fileFields.url,
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
};

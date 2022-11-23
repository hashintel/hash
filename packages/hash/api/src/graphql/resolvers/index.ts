import { JSONObjectResolver } from "graphql-scalars";

import { Entity } from "../apiTypes.gen";
import { embedCode } from "./embed";

import { me } from "./knowledge/user/me";
import { isShortnameTaken } from "./knowledge/user/is-shortname-taken";
import { fileFields } from "./file";
import { requestFileUpload } from "./file/requestFileUpload";
import { createFileFromLink } from "./file/createFileFromLink";
import { loggedIn } from "./middlewares/loggedIn";
import { loggedInAndSignedUp } from "./middlewares/loggedInAndSignedUp";
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
import { hashInstanceEntity } from "./knowledge/hashInstance/hashInstance";

/** @todo - Refactor the names of these https://app.asana.com/0/1200211978612931/1203234667392169/f */
export const resolvers = {
  Query: {
    // Logged in and signed up users only,
    getBlockProtocolBlocks,
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
    hashInstanceEntity,
  },

  Mutation: {
    // Logged in and signed up users only
    createLinkedAggregation: loggedInAndSignedUp(createLinkedAggregation),
    updateLinkedAggregationOperation: loggedInAndSignedUp(
      updateLinkedAggregationOperation,
    ),
    deleteLinkedAggregation: loggedInAndSignedUp(deleteLinkedAggregation),
    createFileFromLink: loggedInAndSignedUp(createFileFromLink),
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

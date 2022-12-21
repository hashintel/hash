import { JSONObjectResolver } from "graphql-scalars";

import { embedCode } from "./embed";

import { meResolver } from "./knowledge/user/me";
import { isShortnameTakenResolver } from "./knowledge/user/is-shortname-taken";
import { fileFields } from "./file";
import { requestFileUpload } from "./file/requestFileUpload";
import { loggedInMiddleware } from "./middlewares/loggedIn";
import { loggedInAndSignedUpMiddleware } from "./middlewares/loggedInAndSignedUp";
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
  createPropertyTypeResolver,
  getAllLatestPropertyTypesResolver,
  getPropertyTypeResolver,
  updatePropertyTypeResolver,
} from "./ontology/property-type";

import {
  createEntityTypeResolver,
  getAllLatestEntityTypesResolver,
  getEntityTypeResolver,
  updateEntityTypeResolver,
} from "./ontology/entity-type";
import { updatePageContents, pageContents } from "./knowledge/page";
import {
  createPageResolver,
  pageResolver,
  pagesResolver,
  parentPageResolver,
  pageCommentsResolver,
} from "./knowledge/page/page";
import { createCommentResolver } from "./knowledge/comment/comment";
import { blocksResolver } from "./knowledge/block/block";
import { getBlockProtocolBlocksResolver } from "./blockprotocol/getBlock";
import {
  createEntityResolver,
  getEntityResolver,
  getAllLatestEntitiesResolver,
  updateEntityResolver,
  archiveEntityResolver,
} from "./knowledge/entity/entity";
import { setParentPageResolver } from "./knowledge/page/set-parent-page";
import { updatePageResolver } from "./knowledge/page/update-page";
import { commentHasTextResolver } from "./knowledge/comment/has-text";
import { commentTextUpdatedAtResolver } from "./knowledge/comment/text-updated-at";
import { commentRepliesResolver } from "./knowledge/comment/replies";
import { commentParentResolver } from "./knowledge/comment/parent";
import { commentAuthorResolver } from "./knowledge/comment/author";
import { resolveCommentResolver } from "./knowledge/comment/resolve";
import { deleteCommentResolver } from "./knowledge/comment/delete";
import { updateCommentTextResolver } from "./knowledge/comment/update-text";
import { blockChildEntityResolver } from "./knowledge/block/data-entity";
import { loggedInAndSignedUpHashInstanceAdminMiddleware } from "./middlewares/loggedInAndSignedUpHashInstanceAdmin";
import { createUserResolver } from "./knowledge/user/create-user";
import { createOrgResolver } from "./knowledge/org/create-org";
import { hashInstanceEntityResolver } from "./knowledge/hashInstance/hashInstance";

/** @todo - Refactor the names of these https://app.asana.com/0/1200211978612931/1203234667392169/f */
export const resolvers = {
  Query: {
    // Logged in and signed up users only,
    getBlockProtocolBlocks: getBlockProtocolBlocksResolver,
    getLinkedAggregation: loggedInAndSignedUpMiddleware(getLinkedAggregation),
    // Logged in users only
    me: loggedInMiddleware(meResolver),
    // Any user
    isShortnameTaken: isShortnameTakenResolver,
    embedCode,
    // Ontology
    getAllLatestDataTypes: loggedInAndSignedUpMiddleware(getAllLatestDataTypes),
    getDataType,
    getAllLatestPropertyTypes: loggedInAndSignedUpMiddleware(
      getAllLatestPropertyTypesResolver,
    ),
    getPropertyType: getPropertyTypeResolver,
    getAllLatestEntityTypes: loggedInAndSignedUpMiddleware(
      getAllLatestEntityTypesResolver,
    ),
    getEntityType: getEntityTypeResolver,
    // Knowledge
    page: pageResolver,
    pages: loggedInAndSignedUpMiddleware(pagesResolver),
    pageComments: loggedInAndSignedUpMiddleware(pageCommentsResolver),
    blocks: loggedInAndSignedUpMiddleware(blocksResolver),
    getEntity: loggedInAndSignedUpMiddleware(getEntityResolver),
    getAllLatestEntities: getAllLatestEntitiesResolver,
    hashInstanceEntity: hashInstanceEntityResolver,
  },

  Mutation: {
    // Logged in and signed up users only
    createLinkedAggregation: loggedInAndSignedUpMiddleware(
      createLinkedAggregation,
    ),
    updateLinkedAggregationOperation: loggedInAndSignedUpMiddleware(
      updateLinkedAggregationOperation,
    ),
    deleteLinkedAggregation: loggedInAndSignedUpMiddleware(
      deleteLinkedAggregation,
    ),
    updatePageContents: loggedInAndSignedUpMiddleware(updatePageContents),
    requestFileUpload: loggedInAndSignedUpMiddleware(requestFileUpload),
    // Task execution
    executeDemoTask,
    executeGithubSpecTask,
    executeGithubCheckTask,
    executeGithubDiscoverTask: loggedInAndSignedUpMiddleware(
      executeGithubDiscoverTask,
    ),
    executeGithubReadTask: loggedInAndSignedUpMiddleware(executeGithubReadTask),
    // Ontology
    createPropertyType: loggedInAndSignedUpMiddleware(
      createPropertyTypeResolver,
    ),
    updatePropertyType: loggedInAndSignedUpMiddleware(
      updatePropertyTypeResolver,
    ),
    createEntityType: loggedInAndSignedUpMiddleware(createEntityTypeResolver),
    updateEntityType: loggedInAndSignedUpMiddleware(updateEntityTypeResolver),
    // Knowledge
    createEntity: loggedInAndSignedUpMiddleware(createEntityResolver),
    updateEntity: loggedInMiddleware(updateEntityResolver),
    archiveEntity: loggedInMiddleware(archiveEntityResolver),
    createPage: loggedInAndSignedUpMiddleware(createPageResolver),
    setParentPage: loggedInAndSignedUpMiddleware(setParentPageResolver),
    updatePage: loggedInAndSignedUpMiddleware(updatePageResolver),
    createComment: loggedInAndSignedUpMiddleware(createCommentResolver),
    resolveComment: loggedInAndSignedUpMiddleware(resolveCommentResolver),
    deleteComment: loggedInAndSignedUpMiddleware(deleteCommentResolver),
    updateCommentText: loggedInAndSignedUpMiddleware(updateCommentTextResolver),
    // HASH instance admin mutations
    createUser:
      loggedInAndSignedUpHashInstanceAdminMiddleware(createUserResolver),
    createOrg:
      loggedInAndSignedUpHashInstanceAdminMiddleware(createOrgResolver),
  },

  JSONObject: JSONObjectResolver,

  FileProperties: {
    url: fileFields.url,
  },

  LinkedAggregation: {
    results: linkedAggregationResults,
  },

  // New knowledge field resolvers
  Page: {
    contents: pageContents,
    parentPage: parentPageResolver,
  },

  Comment: {
    hasText: commentHasTextResolver,
    textUpdatedAt: commentTextUpdatedAtResolver,
    parent: commentParentResolver,
    author: commentAuthorResolver,
    replies: commentRepliesResolver,
  },

  Block: {
    blockChildEntity: blockChildEntityResolver,
  },
};

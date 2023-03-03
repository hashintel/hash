import { JSONObjectResolver } from "graphql-scalars";

import { getBlockProtocolBlocksResolver } from "./blockprotocol/get-block";
import { embedCode } from "./embed";
import { blocksResolver } from "./knowledge/block/block";
import { blockChildEntityResolver } from "./knowledge/block/data-entity";
import { commentAuthorResolver } from "./knowledge/comment/author";
import { createCommentResolver } from "./knowledge/comment/comment";
import { deleteCommentResolver } from "./knowledge/comment/delete";
import { commentHasTextResolver } from "./knowledge/comment/has-text";
import { commentParentResolver } from "./knowledge/comment/parent";
import { commentRepliesResolver } from "./knowledge/comment/replies";
import { resolveCommentResolver } from "./knowledge/comment/resolve";
import { commentTextUpdatedAtResolver } from "./knowledge/comment/text-updated-at";
import { updateCommentTextResolver } from "./knowledge/comment/update-text";
import {
  archiveEntityResolver,
  createEntityResolver,
  getEntityResolver,
  queryEntitiesResolver,
  updateEntityResolver,
} from "./knowledge/entity/entity";
import { createFileFromUrl } from "./knowledge/file/create-file-from-url";
import { requestFileUpload } from "./knowledge/file/request-file-upload";
import { hashInstanceEntityResolver } from "./knowledge/hash-instance/hash-instance";
import { createOrgResolver } from "./knowledge/org/create-org";
import { pageContents, updatePageContents } from "./knowledge/page";
import {
  createPageResolver,
  pageCommentsResolver,
  pageResolver,
  pagesResolver,
  parentPageResolver,
} from "./knowledge/page/page";
import { setParentPageResolver } from "./knowledge/page/set-parent-page";
import { updatePageResolver } from "./knowledge/page/update-page";
import { createUserResolver } from "./knowledge/user/create-user";
import { isShortnameTakenResolver } from "./knowledge/user/is-shortname-taken";
import { meResolver } from "./knowledge/user/me";
import { createLinkedAggregation } from "./linked-aggregation/create-linked-aggregation";
import { deleteLinkedAggregation } from "./linked-aggregation/delete-linked-aggregation";
import { getLinkedAggregation } from "./linked-aggregation/get-linked-aggregation";
import { linkedAggregationResults } from "./linked-aggregation/linked-aggregation-results";
import { updateLinkedAggregationOperation } from "./linked-aggregation/update-linked-aggregation-operation";
import { loggedInMiddleware } from "./middlewares/logged-in";
import { loggedInAndSignedUpMiddleware } from "./middlewares/logged-in-and-signed-up";
import { loggedInAndSignedUpHashInstanceAdminMiddleware } from "./middlewares/logged-in-and-signed-up-hash-instance-admin";
import { getDataType, queryDataTypes } from "./ontology/data-type";
import {
  createEntityTypeResolver,
  getEntityTypeResolver,
  queryEntityTypesResolver,
  updateEntityTypeResolver,
} from "./ontology/entity-type";
import {
  createPropertyTypeResolver,
  getPropertyTypeResolver,
  queryPropertyTypesResolver,
  updatePropertyTypeResolver,
} from "./ontology/property-type";
import {
  executeAsanaCheckTask,
  executeAsanaDiscoverTask,
  executeAsanaReadTask,
  executeAsanaSpecTask,
  executeDemoTask,
  executeGithubCheckTask,
  executeGithubDiscoverTask,
  executeGithubReadTask,
  executeGithubSpecTask,
} from "./task-executor";

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
    queryDataTypes: loggedInAndSignedUpMiddleware(queryDataTypes),
    getDataType,
    queryPropertyTypes: loggedInAndSignedUpMiddleware(
      queryPropertyTypesResolver,
    ),
    getPropertyType: getPropertyTypeResolver,
    queryEntityTypes: loggedInAndSignedUpMiddleware(queryEntityTypesResolver),
    getEntityType: getEntityTypeResolver,
    // Knowledge
    page: pageResolver,
    pages: loggedInAndSignedUpMiddleware(pagesResolver),
    pageComments: loggedInAndSignedUpMiddleware(pageCommentsResolver),
    blocks: loggedInAndSignedUpMiddleware(blocksResolver),
    getEntity: getEntityResolver,
    queryEntities: queryEntitiesResolver,
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
    createFileFromUrl: loggedInAndSignedUpMiddleware(createFileFromUrl),
    // Task execution
    executeDemoTask,
    executeGithubSpecTask,
    executeGithubCheckTask,
    executeGithubDiscoverTask: loggedInAndSignedUpMiddleware(
      executeGithubDiscoverTask,
    ),
    executeGithubReadTask: loggedInAndSignedUpMiddleware(executeGithubReadTask),
    executeAsanaSpecTask,
    executeAsanaCheckTask,
    executeAsanaDiscoverTask: loggedInAndSignedUpMiddleware(
      executeAsanaDiscoverTask,
    ),
    executeAsanaReadTask: loggedInAndSignedUpMiddleware(executeAsanaReadTask),
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

import { JSONObjectResolver } from "graphql-scalars";

import { embedCode } from "./embed";

import { me } from "./knowledge/user/me";
import { isShortnameTaken } from "./knowledge/user/is-shortname-taken";
import { fileFields } from "./file";
import { requestFileUpload } from "./file/requestFileUpload";
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
  createPropertyTypeResolver,
  getAllLatestPropertyTypesResolver,
  getPropertyTypeResolver,
  updatePropertyTypeResolver,
} from "./ontology/property-type";

import {
  createEntityType,
  getAllLatestEntityTypes,
  getEntityType,
  updateEntityType,
} from "./ontology/entity-type";
import { updatePageContents, pageContents } from "./knowledge/page";
import {
  createPage,
  page,
  pages,
  parentPage,
  pageComments,
} from "./knowledge/page/page";
import { createComment } from "./knowledge/comment/comment";
import { blocks } from "./knowledge/block/block";
import { getBlockProtocolBlocks } from "./blockprotocol/getBlock";
import {
  createEntity,
  getEntity,
  getAllLatestEntities,
  updateEntity,
  archiveEntity,
} from "./knowledge/entity/entity";
import { setParentPage } from "./knowledge/page/set-parent-page";
import { updatePage } from "./knowledge/page/update-page";
import { commentHasText } from "./knowledge/comment/has-text";
import { commentTextUpdatedAt } from "./knowledge/comment/text-updated-at";
import { commentReplies } from "./knowledge/comment/replies";
import { commentParent } from "./knowledge/comment/parent";
import { commentAuthor } from "./knowledge/comment/author";
import { resolveComment } from "./knowledge/comment/resolve";
import { deleteComment } from "./knowledge/comment/delete";
import { updateCommentText } from "./knowledge/comment/update-text";
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
    getDataType,
    getAllLatestPropertyTypes: loggedInAndSignedUp(
      getAllLatestPropertyTypesResolver,
    ),
    getPropertyType: getPropertyTypeResolver,
    getAllLatestEntityTypes: loggedInAndSignedUp(getAllLatestEntityTypes),
    getEntityType,
    // Knowledge
    page,
    pages: loggedInAndSignedUp(pages),
    pageComments: loggedInAndSignedUp(pageComments),
    blocks: loggedInAndSignedUp(blocks),
    getEntity: loggedInAndSignedUp(getEntity),
    getAllLatestEntities: loggedInAndSignedUp(getAllLatestEntities),
    hashInstanceEntity,
  },

  Mutation: {
    // Logged in and signed up users only
    createLinkedAggregation: loggedInAndSignedUp(createLinkedAggregation),
    updateLinkedAggregationOperation: loggedInAndSignedUp(
      updateLinkedAggregationOperation,
    ),
    deleteLinkedAggregation: loggedInAndSignedUp(deleteLinkedAggregation),
    updatePageContents: loggedInAndSignedUp(updatePageContents),
    requestFileUpload: loggedInAndSignedUp(requestFileUpload),
    // Task execution
    executeDemoTask,
    executeGithubSpecTask,
    executeGithubCheckTask,
    executeGithubDiscoverTask: loggedInAndSignedUp(executeGithubDiscoverTask),
    executeGithubReadTask: loggedInAndSignedUp(executeGithubReadTask),
    // Ontology
    createPropertyType: loggedInAndSignedUp(createPropertyTypeResolver),
    updatePropertyType: loggedInAndSignedUp(updatePropertyTypeResolver),
    createEntityType: loggedInAndSignedUp(createEntityType),
    updateEntityType: loggedInAndSignedUp(updateEntityType),
    // Knowledge
    createEntity: loggedInAndSignedUp(createEntity),
    updateEntity: loggedIn(updateEntity),
    archiveEntity: loggedIn(archiveEntity),
    createPage: loggedInAndSignedUp(createPage),
    setParentPage: loggedInAndSignedUp(setParentPage),
    updatePage: loggedInAndSignedUp(updatePage),
    createComment: loggedInAndSignedUp(createComment),
    resolveComment: loggedInAndSignedUp(resolveComment),
    deleteComment: loggedInAndSignedUp(deleteComment),
    updateCommentText: loggedInAndSignedUp(updateCommentText),
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

  // New knowledge field resolvers
  Page: {
    contents: pageContents,
    parentPage,
  },

  Comment: {
    hasText: commentHasText,
    textUpdatedAt: commentTextUpdatedAt,
    parent: commentParent,
    author: commentAuthor,
    replies: commentReplies,
  },

  Block: {
    blockChildEntity,
  },
};

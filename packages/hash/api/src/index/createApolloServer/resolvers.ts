import { JSONObjectResolver } from "graphql-scalars";

import { embedCode } from "./resolvers/embed";

import { me } from "./resolvers/me";
import { isShortnameTaken } from "./resolvers/is-shortname-taken";
import { fileFields } from "./resolvers/file";
import { requestFileUpload } from "./resolvers/requestFileUpload";
import { loggedIn } from "./resolvers/loggedIn";
import { loggedInAndSignedUp } from "./resolvers/loggedInAndSignedUp";
import { deleteLinkedAggregation } from "./resolvers/deleteLinkedAggregation";
import { updateLinkedAggregationOperation } from "./resolvers/updateLinkedAggregationOperation";
import { createLinkedAggregation } from "./resolvers/createLinkedAggregation";
import { linkedAggregationResults } from "./resolvers/linkedAggregationResults";
import {
  executeDemoTask,
  executeGithubSpecTask,
  executeGithubCheckTask,
  executeGithubDiscoverTask,
  executeGithubReadTask,
} from "./resolvers/taskExecutor";
import { getLinkedAggregation } from "./resolvers/getLinkedAggregation";
import { getAllLatestDataTypes, getDataType } from "./resolvers/data-type";
import {
  createPropertyTypeResolver,
  getAllLatestPropertyTypesResolver,
  getPropertyTypeResolver,
  updatePropertyTypeResolver,
} from "./resolvers/property-type";

import {
  createEntityTypeResolver,
  getAllLatestEntityTypesResolver,
  getEntityTypeResolver,
  updateEntityTypeResolver,
} from "./resolvers/entity-type";
import { updatePageContents, pageContents } from "./resolvers/page";
import {
  createPage,
  page,
  pages,
  parentPage,
  pageComments,
} from "./resolvers/graphql-resolvers-knowledge-page-page";
import { createComment } from "./resolvers/comment";
import { blocks } from "./resolvers/block";
import { getBlockProtocolBlocks } from "./resolvers/getBlock";
import {
  createEntityResolver,
  getEntityResolver,
  getAllLatestEntitiesResolver,
  updateEntityResolver,
  archiveEntity,
} from "./resolvers/entity";
import { setParentPage } from "./resolvers/set-parent-page";
import { updatePage } from "./resolvers/update-page";
import { commentHasText } from "./resolvers/has-text";
import { commentTextUpdatedAt } from "./resolvers/text-updated-at";
import { commentReplies } from "./resolvers/replies";
import { commentParent } from "./resolvers/parent";
import { commentAuthor } from "./resolvers/author";
import { resolveComment } from "./resolvers/resolve";
import { deleteComment } from "./resolvers/delete";
import { updateCommentText } from "./resolvers/update-text";
import { blockChildEntity } from "./resolvers/data-entity";
import { loggedInAndSignedUpHashInstanceAdmin } from "./resolvers/loggedInAndSignedUpHashInstanceAdmin";
import { createUser } from "./resolvers/create-user";
import { createOrg } from "./resolvers/create-org";
import { hashInstanceEntity } from "./resolvers/hashInstance";

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
    getAllLatestEntityTypes: loggedInAndSignedUp(
      getAllLatestEntityTypesResolver,
    ),
    getEntityType: getEntityTypeResolver,
    // Knowledge
    page,
    pages: loggedInAndSignedUp(pages),
    pageComments: loggedInAndSignedUp(pageComments),
    blocks: loggedInAndSignedUp(blocks),
    getEntity: loggedInAndSignedUp(getEntityResolver),
    getAllLatestEntities: getAllLatestEntitiesResolver,
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
    createEntityType: loggedInAndSignedUp(createEntityTypeResolver),
    updateEntityType: loggedInAndSignedUp(updateEntityTypeResolver),
    // Knowledge
    createEntity: loggedInAndSignedUp(createEntityResolver),
    updateEntity: loggedIn(updateEntityResolver),
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

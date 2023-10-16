import { JSONObjectResolver } from "graphql-scalars";

import {
  MutationResolvers,
  QueryResolvers,
  ResolverFn,
  Resolvers,
} from "../api-types.gen";
import { GraphQLContext } from "../context";
import { getBlockProtocolBlocksResolver } from "./blockprotocol/get-block";
import { embedCode } from "./embed";
import { getLinearOrganizationResolver } from "./integrations/linear/linear-organization";
import { syncLinearIntegrationWithWorkspacesMutation } from "./integrations/linear/sync-workspaces-with-teams";
import { blocksResolver } from "./knowledge/block/block";
import { blockChildEntityResolver } from "./knowledge/block/data-entity";
import { blockCollectionContents } from "./knowledge/block-collection/block-collection-contents";
import { updateBlockCollectionContents } from "./knowledge/block-collection/update-block-collection-contents";
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
  addEntityEditorResolver,
  addEntityOwnerResolver,
  addEntityViewerResolver,
  archiveEntityResolver,
  createEntityResolver,
  getEntityResolver,
  inferEntitiesResolver,
  isEntityPublicResolver,
  queryEntitiesResolver,
  removeEntityEditorResolver,
  removeEntityOwnerResolver,
  removeEntityViewerResolver,
  structuralQueryEntitiesResolver,
  updateEntityResolver,
} from "./knowledge/entity/entity";
import { createFileFromUrl } from "./knowledge/file/create-file-from-url";
import { requestFileUpload } from "./knowledge/file/request-file-upload";
import { hashInstanceEntityResolver } from "./knowledge/hash-instance/hash-instance";
import { createOrgResolver } from "./knowledge/org/create-org";
import { pageContents } from "./knowledge/page";
import {
  createPageResolver,
  pageCommentsResolver,
  pageResolver,
  pagesResolver,
  parentPageResolver,
} from "./knowledge/page/page";
import { setParentPageResolver } from "./knowledge/page/set-parent-page";
import { updatePageResolver } from "./knowledge/page/update-page";
import { isShortnameTakenResolver } from "./knowledge/user/is-shortname-taken";
import { meResolver } from "./knowledge/user/me";
import { loggedInMiddleware } from "./middlewares/logged-in";
import { loggedInAndSignedUpMiddleware } from "./middlewares/logged-in-and-signed-up";
import { getDataType, queryDataTypes } from "./ontology/data-type";
import {
  archiveEntityTypeResolver,
  createEntityTypeResolver,
  getEntityTypeResolver,
  queryEntityTypesResolver,
  unarchiveEntityTypeResolver,
  updateEntityTypeResolver,
} from "./ontology/entity-type";
import {
  archivePropertyTypeResolver,
  createPropertyTypeResolver,
  getPropertyTypeResolver,
  queryPropertyTypesResolver,
  unarchivePropertyTypeResolver,
  updatePropertyTypeResolver,
} from "./ontology/property-type";

export const resolvers: Omit<Resolvers, "Query" | "Mutation"> & {
  Query: Record<
    keyof QueryResolvers,
    ResolverFn<any, any, GraphQLContext, any>
  >;
  Mutation: Record<
    keyof MutationResolvers,
    ResolverFn<any, any, GraphQLContext, any>
  >;
} = {
  Query: {
    // Logged in and signed up users only,
    getBlockProtocolBlocks: getBlockProtocolBlocksResolver,
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
    isEntityPublic: loggedInAndSignedUpMiddleware(isEntityPublicResolver),
    structuralQueryEntities: structuralQueryEntitiesResolver,
    hashInstanceEntity: hashInstanceEntityResolver,
    // Integration
    getLinearOrganization: loggedInAndSignedUpMiddleware(
      getLinearOrganizationResolver,
    ),
  },

  Mutation: {
    // Logged in and signed up users only
    updateBlockCollectionContents: loggedInAndSignedUpMiddleware(
      updateBlockCollectionContents,
    ),
    requestFileUpload: loggedInAndSignedUpMiddleware(requestFileUpload),
    createFileFromUrl: loggedInAndSignedUpMiddleware(createFileFromUrl),
    // Ontology
    createPropertyType: loggedInAndSignedUpMiddleware(
      createPropertyTypeResolver,
    ),
    updatePropertyType: loggedInAndSignedUpMiddleware(
      updatePropertyTypeResolver,
    ),
    archivePropertyType: loggedInAndSignedUpMiddleware(
      archivePropertyTypeResolver,
    ),
    unarchivePropertyType: loggedInAndSignedUpMiddleware(
      unarchivePropertyTypeResolver,
    ),
    createEntityType: loggedInAndSignedUpMiddleware(createEntityTypeResolver),
    updateEntityType: loggedInAndSignedUpMiddleware(updateEntityTypeResolver),
    archiveEntityType: loggedInAndSignedUpMiddleware(archiveEntityTypeResolver),
    unarchiveEntityType: loggedInAndSignedUpMiddleware(
      unarchiveEntityTypeResolver,
    ),
    // Knowledge
    createEntity: loggedInAndSignedUpMiddleware(createEntityResolver),
    inferEntities: loggedInAndSignedUpMiddleware(inferEntitiesResolver),
    updateEntity: loggedInMiddleware(updateEntityResolver),
    archiveEntity: loggedInMiddleware(archiveEntityResolver),
    createPage: loggedInAndSignedUpMiddleware(createPageResolver),
    setParentPage: loggedInAndSignedUpMiddleware(setParentPageResolver),
    updatePage: loggedInAndSignedUpMiddleware(updatePageResolver),
    createComment: loggedInAndSignedUpMiddleware(createCommentResolver),
    resolveComment: loggedInAndSignedUpMiddleware(resolveCommentResolver),
    deleteComment: loggedInAndSignedUpMiddleware(deleteCommentResolver),
    updateCommentText: loggedInAndSignedUpMiddleware(updateCommentTextResolver),

    createOrg: loggedInAndSignedUpMiddleware(createOrgResolver),

    addEntityOwner: loggedInAndSignedUpMiddleware(addEntityOwnerResolver),
    removeEntityOwner: loggedInAndSignedUpMiddleware(removeEntityOwnerResolver),
    addEntityEditor: loggedInAndSignedUpMiddleware(addEntityEditorResolver),
    removeEntityEditor: loggedInAndSignedUpMiddleware(
      removeEntityEditorResolver,
    ),
    addEntityViewer: loggedInAndSignedUpMiddleware(addEntityViewerResolver),
    removeEntityViewer: loggedInAndSignedUpMiddleware(
      removeEntityViewerResolver,
    ),

    // Integration
    syncLinearIntegrationWithWorkspaces: loggedInAndSignedUpMiddleware(
      syncLinearIntegrationWithWorkspacesMutation,
    ),
  },

  JSONObject: JSONObjectResolver,

  Page: {
    // @ts-expect-error –– the type requires 'blockChildEntity' inside the return, but we deal with it in a field resolver
    contents: pageContents,
    // @ts-expect-error –– the type requires 'contents' to be returned here, but we deal with it in a field resolver
    parentPage: parentPageResolver,
  },

  BlockCollection: {
    // @ts-expect-error –– the type requires 'blockChildEntity' inside the return, but we deal with it in a field resolver
    contents: blockCollectionContents,
  },

  Comment: {
    hasText: commentHasTextResolver,
    textUpdatedAt: commentTextUpdatedAtResolver,
    parent: commentParentResolver,
    author: commentAuthorResolver,
    // @ts-expect-error –– the type requires all comment fields returned, but many are dealt with in field resolvers above
    replies: commentRepliesResolver,
  },

  Block: {
    blockChildEntity: blockChildEntityResolver,
  },
};

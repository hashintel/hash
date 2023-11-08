import { JSONObjectResolver } from "graphql-scalars";

import {
  addAccountGroupMember,
  removeAccountGroupMember,
} from "../../graph/account-permission-management";
import {
  EntityAuthorizationSubject,
  MutationResolvers,
  QueryResolvers,
  Resolvers,
} from "../api-types.gen";
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
  getEntityAuthorizationRelationshipsResolver,
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
} from "./knowledge/page/page";
import { setParentPageResolver } from "./knowledge/page/set-parent-page";
import { updatePageResolver } from "./knowledge/page/update-page";
import {
  canUserEdit,
  checkUserPermissionsOnEntity,
} from "./knowledge/shared/check-permissions";
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
  Query: Required<QueryResolvers>;
  Mutation: Required<MutationResolvers>;
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
    queryDataTypes,
    getDataType,
    queryPropertyTypes: queryPropertyTypesResolver,
    getPropertyType: getPropertyTypeResolver,
    queryEntityTypes: queryEntityTypesResolver,
    getEntityType: getEntityTypeResolver,
    // Knowledge
    pageComments: loggedInAndSignedUpMiddleware(pageCommentsResolver),
    blocks: loggedInAndSignedUpMiddleware(blocksResolver),
    getEntity: getEntityResolver,
    queryEntities: queryEntitiesResolver,
    isEntityPublic: loggedInAndSignedUpMiddleware(isEntityPublicResolver),
    getEntityAuthorizationRelationships: loggedInAndSignedUpMiddleware(
      getEntityAuthorizationRelationshipsResolver,
    ),
    structuralQueryEntities: structuralQueryEntitiesResolver,
    hashInstanceEntity: hashInstanceEntityResolver,
    // Integration
    getLinearOrganization: loggedInAndSignedUpMiddleware(
      getLinearOrganizationResolver,
    ),
    checkUserPermissionsOnEntity: (_, { metadata }, context, info) =>
      checkUserPermissionsOnEntity({ metadata }, _, context, info),
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

    addAccountGroupMember: (_, { accountId, accountGroupId }, context) =>
      addAccountGroupMember(context.dataSources, context.authentication, {
        accountId,
        accountGroupId,
      }),
    removeAccountGroupMember: (_, { accountId, accountGroupId }, context) =>
      removeAccountGroupMember(context.dataSources, context.authentication, {
        accountId,
        accountGroupId,
      }),

    // Integration
    syncLinearIntegrationWithWorkspaces: loggedInAndSignedUpMiddleware(
      syncLinearIntegrationWithWorkspacesMutation,
    ),
  },

  JSONObject: JSONObjectResolver,

  Page: {
    userPermissions: checkUserPermissionsOnEntity,
    // @ts-expect-error –– the type requires 'blockChildEntity' inside the return, but we deal with it in a field resolver
    contents: pageContents,
  },

  BlockCollection: {
    // @ts-expect-error –– the type requires 'blockChildEntity' inside the return, but we deal with it in a field resolver
    contents: blockCollectionContents,
  },

  Comment: {
    canUserEdit,
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

  EntityAuthorizationSubject: {
    __resolveType(object: EntityAuthorizationSubject) {
      if ("accountGroupId" in object) {
        return "AccountGroupAuthorizationSubject";
      } else if ("accountId" in object) {
        return "AccountAuthorizationSubject";
      } else {
        return "PublicAuthorizationSubject";
      }
    },
  },
};

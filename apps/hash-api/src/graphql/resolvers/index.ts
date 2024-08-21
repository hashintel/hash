import { JSONObjectResolver } from "graphql-scalars";

import {
  addAccountGroupMember,
  removeAccountGroupMember,
} from "../../graph/account-permission-management";
import type {
  EntityAuthorizationSubject,
  MutationResolvers,
  QueryResolvers,
  Resolvers,
} from "../api-types.gen";
import { getBlockProtocolBlocksResolver } from "./blockprotocol/get-block";
import { embedCode } from "./embed";
import { cancelFlow } from "./flows/cancel-flow";
import { getFlowRunByIdResolver } from "./flows/get-flow-run-by-id";
import { getFlowRunsResolver } from "./flows/get-flow-runs";
import { resetFlow } from "./flows/reset-flow";
import { startFlow } from "./flows/start-flow";
import { submitExternalInputResponse } from "./flows/submit-external-input-response";
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
  archiveEntitiesResolver,
  archiveEntityResolver,
  createEntityResolver,
  getEntityAuthorizationRelationshipsResolver,
  getEntityResolver,
  getEntitySubgraphResolver,
  isEntityPublicResolver,
  queryEntitiesResolver,
  removeEntityEditorResolver,
  removeEntityOwnerResolver,
  removeEntityViewerResolver,
  updateEntitiesResolver,
  updateEntityResolver,
} from "./knowledge/entity/entity";
import { getEntityDiffsResolver } from "./knowledge/entity/get-entity-diffs";
import { createFileFromUrl } from "./knowledge/file/create-file-from-url";
import { requestFileUpload } from "./knowledge/file/request-file-upload";
import { hashInstanceSettingsResolver } from "./knowledge/hash-instance/hash-instance";
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
import { getUsageRecordsResolver } from "./knowledge/user/get-usage-records";
import { getWaitlistPositionResolver } from "./knowledge/user/get-waitlist-position";
import { hasAccessToHashResolver } from "./knowledge/user/has-access-to-hash";
import { isShortnameTakenResolver } from "./knowledge/user/is-shortname-taken";
import { meResolver } from "./knowledge/user/me";
import { submitEarlyAccessFormResolver } from "./knowledge/user/submit-early-access-form";
import { loggedInMiddleware } from "./middlewares/logged-in";
import { loggedInAndSignedUpMiddleware } from "./middlewares/logged-in-and-signed-up";
import { getDataType, queryDataTypes } from "./ontology/data-type";
import {
  archiveEntityTypeResolver,
  checkUserPermissionsOnEntityTypeResolver,
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
    getWaitlistPosition: loggedInMiddleware(getWaitlistPositionResolver),
    // Admins
    getUsageRecords: loggedInMiddleware(getUsageRecordsResolver),
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
    getEntityDiffs: getEntityDiffsResolver,
    getFlowRuns: loggedInAndSignedUpMiddleware(getFlowRunsResolver),
    getFlowRunById: loggedInAndSignedUpMiddleware(getFlowRunByIdResolver),
    queryEntities: queryEntitiesResolver,
    isEntityPublic: loggedInAndSignedUpMiddleware(isEntityPublicResolver),
    getEntityAuthorizationRelationships: loggedInAndSignedUpMiddleware(
      getEntityAuthorizationRelationshipsResolver,
    ),
    getEntitySubgraph: getEntitySubgraphResolver,
    hashInstanceSettings: hashInstanceSettingsResolver,
    // Integration
    getLinearOrganization: loggedInAndSignedUpMiddleware(
      getLinearOrganizationResolver,
    ),
    checkUserPermissionsOnEntity: (_, { metadata }, context, info) =>
      checkUserPermissionsOnEntity({ metadata }, _, context, info),
    checkUserPermissionsOnEntityType: checkUserPermissionsOnEntityTypeResolver,
    hasAccessToHash: loggedInMiddleware(hasAccessToHashResolver),
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
    updateEntity: loggedInMiddleware(updateEntityResolver),
    updateEntities: loggedInMiddleware(updateEntitiesResolver),
    archiveEntity: loggedInMiddleware(archiveEntityResolver),
    archiveEntities: loggedInMiddleware(archiveEntitiesResolver),
    createPage: loggedInAndSignedUpMiddleware(createPageResolver),
    setParentPage: loggedInAndSignedUpMiddleware(setParentPageResolver),
    updatePage: loggedInAndSignedUpMiddleware(updatePageResolver),
    createComment: loggedInAndSignedUpMiddleware(createCommentResolver),
    resolveComment: loggedInAndSignedUpMiddleware(resolveCommentResolver),
    deleteComment: loggedInAndSignedUpMiddleware(deleteCommentResolver),
    updateCommentText: loggedInAndSignedUpMiddleware(updateCommentTextResolver),

    createOrg: loggedInAndSignedUpMiddleware(createOrgResolver),

    submitEarlyAccessForm: loggedInMiddleware(submitEarlyAccessFormResolver),

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

    cancelFlow: loggedInAndSignedUpMiddleware(cancelFlow),
    resetFlow: loggedInAndSignedUpMiddleware(resetFlow),
    startFlow: loggedInAndSignedUpMiddleware(startFlow),
    submitExternalInputResponse: loggedInAndSignedUpMiddleware(
      submitExternalInputResponse,
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

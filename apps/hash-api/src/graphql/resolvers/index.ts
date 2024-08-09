import { JSONObjectResolver } from "graphql-scalars";

import {
  addAccountGroupMember,
  removeAccountGroupMember,
} from "../../graph/account-permission-management.js";
import type {
  EntityAuthorizationSubject,
  MutationResolvers,
  QueryResolvers,
  Resolvers,
} from "../api-types.gen.js";
import { getBlockProtocolBlocksResolver } from "./blockprotocol/get-block.js";
import { embedCode } from "./embed/index.js";
import { getFlowRunByIdResolver } from "./flows/get-flow-run-by-id.js";
import { getFlowRunsResolver } from "./flows/get-flow-runs.js";
import { startFlow } from "./flows/start-flow.js";
import { submitExternalInputResponse } from "./flows/submit-external-input-response.js";
import { getLinearOrganizationResolver } from "./integrations/linear/linear-organization.js";
import { syncLinearIntegrationWithWorkspacesMutation } from "./integrations/linear/sync-workspaces-with-teams.js";
import { blocksResolver } from "./knowledge/block/block.js";
import { blockChildEntityResolver } from "./knowledge/block/data-entity.js";
import { blockCollectionContents } from "./knowledge/block-collection/block-collection-contents.js";
import { updateBlockCollectionContents } from "./knowledge/block-collection/update-block-collection-contents.js";
import { commentAuthorResolver } from "./knowledge/comment/author.js";
import { createCommentResolver } from "./knowledge/comment/comment.js";
import { deleteCommentResolver } from "./knowledge/comment/delete.js";
import { commentHasTextResolver } from "./knowledge/comment/has-text.js";
import { commentParentResolver } from "./knowledge/comment/parent.js";
import { commentRepliesResolver } from "./knowledge/comment/replies.js";
import { resolveCommentResolver } from "./knowledge/comment/resolve.js";
import { commentTextUpdatedAtResolver } from "./knowledge/comment/text-updated-at.js";
import { updateCommentTextResolver } from "./knowledge/comment/update-text.js";
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
} from "./knowledge/entity/entity.js";
import { getEntityDiffsResolver } from "./knowledge/entity/get-entity-diffs.js";
import { createFileFromUrl } from "./knowledge/file/create-file-from-url.js";
import { requestFileUpload } from "./knowledge/file/request-file-upload.js";
import { hashInstanceSettingsResolver } from "./knowledge/hash-instance/hash-instance.js";
import { createOrgResolver } from "./knowledge/org/create-org.js";
import { pageContents } from "./knowledge/page/index.js";
import {
  createPageResolver,
  pageCommentsResolver,
} from "./knowledge/page/page.js";
import { setParentPageResolver } from "./knowledge/page/set-parent-page.js";
import { updatePageResolver } from "./knowledge/page/update-page.js";
import {
  canUserEdit,
  checkUserPermissionsOnEntity,
} from "./knowledge/shared/check-permissions.js";
import { getUsageRecordsResolver } from "./knowledge/user/get-usage-records.js";
import { getWaitlistPositionResolver } from "./knowledge/user/get-waitlist-position.js";
import { hasAccessToHashResolver } from "./knowledge/user/has-access-to-hash.js";
import { isShortnameTakenResolver } from "./knowledge/user/is-shortname-taken.js";
import { meResolver } from "./knowledge/user/me.js";
import { submitEarlyAccessFormResolver } from "./knowledge/user/submit-early-access-form.js";
import { loggedInMiddleware } from "./middlewares/logged-in.js";
import { loggedInAndSignedUpMiddleware } from "./middlewares/logged-in-and-signed-up.js";
import { getDataType, queryDataTypes } from "./ontology/data-type.js";
import {
  archiveEntityTypeResolver,
  checkUserPermissionsOnEntityTypeResolver,
  createEntityTypeResolver,
  getEntityTypeResolver,
  queryEntityTypesResolver,
  unarchiveEntityTypeResolver,
  updateEntityTypeResolver,
} from "./ontology/entity-type.js";
import {
  archivePropertyTypeResolver,
  createPropertyTypeResolver,
  getPropertyTypeResolver,
  queryPropertyTypesResolver,
  unarchivePropertyTypeResolver,
  updatePropertyTypeResolver,
} from "./ontology/property-type.js";

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

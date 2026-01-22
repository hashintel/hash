import { JSONObjectResolver } from "graphql-scalars";

import type {
  EntityAuthorizationSubject,
  MutationResolvers,
  PendingOrgInvitation,
  QueryResolvers,
  Resolvers,
} from "../api-types.gen";
import { getBlockProtocolBlocksResolver } from "./blockprotocol/get-block";
import { embedCode } from "./embed";
import { cancelFlow } from "./flows/cancel-flow";
import {
  archiveFlowScheduleResolver,
  createFlowScheduleResolver,
  pauseFlowScheduleResolver,
  resumeFlowScheduleResolver,
  updateFlowScheduleResolver,
} from "./flows/flow-schedule";
import { getFlowRunByIdResolver } from "./flows/get-flow-run-by-id";
import { getFlowRunsResolver } from "./flows/get-flow-runs";
import { resetFlow } from "./flows/reset-flow";
import { startFlow } from "./flows/start-flow";
import { submitExternalInputResponse } from "./flows/submit-external-input-response";
import { generateInverseResolver } from "./generation/generate-inverse";
import { generatePluralResolver } from "./generation/generate-plural";
import { isGenerationAvailableResolver } from "./generation/is-generation-available";
import { getLinearOrganizationResolver } from "./integrations/linear/linear-organization";
import { syncLinearIntegrationWithWebsMutation } from "./integrations/linear/sync-linear-integration-with-webs";
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
import { configureDashboardItemResolver } from "./knowledge/dashboard";
import {
  addEntityViewerResolver,
  archiveEntitiesResolver,
  archiveEntityResolver,
  countEntitiesResolver,
  createEntityResolver,
  isEntityPublicResolver,
  queryEntitiesResolver,
  queryEntitySubgraphResolver,
  removeEntityViewerResolver,
  updateEntitiesResolver,
  updateEntityResolver,
  validateEntityResolver,
} from "./knowledge/entity/entity";
import { getEntityDiffsResolver } from "./knowledge/entity/get-entity-diffs";
import { createFileFromUrl } from "./knowledge/file/create-file-from-url";
import { requestFileUpload } from "./knowledge/file/request-file-upload";
import { hashInstanceSettingsResolver } from "./knowledge/hash-instance/hash-instance";
import { acceptOrgInvitationResolver } from "./knowledge/org/accept-org-invitation";
import { createOrgResolver } from "./knowledge/org/create-org";
import { declineOrgInvitationResolver } from "./knowledge/org/decline-org-invitation";
import { getMyPendingInvitationsResolver } from "./knowledge/org/get-my-pending-invitations";
import { getPendingInvitationByEntityIdResolver } from "./knowledge/org/get-pending-invitation-by-entity-id";
import { inviteUserToOrgResolver } from "./knowledge/org/invite-user-to-org";
import { removeUserFromOrgResolver } from "./knowledge/org/remove-user-from-org";
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
import {
  archiveDataTypeResolver,
  checkUserPermissionsOnDataTypeResolver,
  createDataTypeResolver,
  findDataTypeConversionTargetsResolver,
  queryDataTypesResolver,
  queryDataTypeSubgraphResolver,
  unarchiveDataTypeResolver,
  updateDataTypeResolver,
} from "./ontology/data-type";
import {
  archiveEntityTypeResolver,
  checkUserPermissionsOnEntityTypeResolver,
  createEntityTypeResolver,
  getClosedMultiEntityTypesResolver,
  queryEntityTypesResolver,
  queryEntityTypeSubgraphResolver,
  unarchiveEntityTypeResolver,
  updateEntityTypeResolver,
  updateEntityTypesResolver,
} from "./ontology/entity-type";
import {
  archivePropertyTypeResolver,
  createPropertyTypeResolver,
  queryPropertyTypesResolver,
  queryPropertyTypeSubgraphResolver,
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
    queryDataTypes: queryDataTypesResolver,
    queryDataTypeSubgraph: queryDataTypeSubgraphResolver,
    findDataTypeConversionTargets: findDataTypeConversionTargetsResolver,
    queryPropertyTypes: queryPropertyTypesResolver,
    queryPropertyTypeSubgraph: queryPropertyTypeSubgraphResolver,
    queryEntityTypes: queryEntityTypesResolver,
    queryEntityTypeSubgraph: queryEntityTypeSubgraphResolver,
    getClosedMultiEntityTypes: getClosedMultiEntityTypesResolver,
    // Knowledge
    pageComments: loggedInAndSignedUpMiddleware(pageCommentsResolver),
    blocks: loggedInAndSignedUpMiddleware(blocksResolver),
    getEntityDiffs: getEntityDiffsResolver,
    getFlowRuns: loggedInAndSignedUpMiddleware(getFlowRunsResolver),
    getFlowRunById: loggedInAndSignedUpMiddleware(getFlowRunByIdResolver),
    isEntityPublic: loggedInAndSignedUpMiddleware(isEntityPublicResolver),
    getEntityAuthorizationRelationships: loggedInAndSignedUpMiddleware(() => {
      throw new Error(
        "`getEntityAuthorizationRelationships` is not implemented",
      );
    }),
    countEntities: countEntitiesResolver,
    queryEntities: queryEntitiesResolver,
    queryEntitySubgraph: queryEntitySubgraphResolver,
    hashInstanceSettings: hashInstanceSettingsResolver,
    getMyPendingInvitations: loggedInAndSignedUpMiddleware(
      getMyPendingInvitationsResolver,
    ),
    getPendingInvitationByEntityId: getPendingInvitationByEntityIdResolver,
    // Integration
    getLinearOrganization: loggedInAndSignedUpMiddleware(
      getLinearOrganizationResolver,
    ),
    checkUserPermissionsOnEntity: (_, { metadata }, context, info) =>
      checkUserPermissionsOnEntity({ metadata }, _, context, info),
    checkUserPermissionsOnEntityType: checkUserPermissionsOnEntityTypeResolver,
    checkUserPermissionsOnDataType: checkUserPermissionsOnDataTypeResolver,
    hasAccessToHash: loggedInMiddleware(hasAccessToHashResolver),
    // Generation
    generateInverse: loggedInMiddleware(generateInverseResolver),
    generatePlural: loggedInMiddleware(generatePluralResolver),
    isGenerationAvailable: isGenerationAvailableResolver,
    validateEntity: validateEntityResolver,
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
    createDataType: loggedInAndSignedUpMiddleware(createDataTypeResolver),
    updateDataType: loggedInAndSignedUpMiddleware(updateDataTypeResolver),
    archiveDataType: loggedInAndSignedUpMiddleware(archiveDataTypeResolver),
    unarchiveDataType: loggedInAndSignedUpMiddleware(unarchiveDataTypeResolver),
    createEntityType: loggedInAndSignedUpMiddleware(createEntityTypeResolver),
    updateEntityType: loggedInAndSignedUpMiddleware(updateEntityTypeResolver),
    updateEntityTypes: loggedInAndSignedUpMiddleware(updateEntityTypesResolver),
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

    configureDashboardItem: loggedInAndSignedUpMiddleware(
      configureDashboardItemResolver,
    ),

    createOrg: loggedInAndSignedUpMiddleware(createOrgResolver),
    inviteUserToOrg: loggedInAndSignedUpMiddleware(inviteUserToOrgResolver),
    acceptOrgInvitation: loggedInAndSignedUpMiddleware(
      acceptOrgInvitationResolver,
    ),
    declineOrgInvitation: loggedInAndSignedUpMiddleware(
      declineOrgInvitationResolver,
    ),
    removeUserFromOrg: loggedInAndSignedUpMiddleware(removeUserFromOrgResolver),

    submitEarlyAccessForm: loggedInMiddleware(submitEarlyAccessFormResolver),

    addEntityOwner: loggedInAndSignedUpMiddleware(() => {
      throw new Error("`addEntityOwner` is not implemented");
    }),
    removeEntityOwner: loggedInAndSignedUpMiddleware(() => {
      throw new Error("`removeEntityOwner` is not implemented");
    }),
    addEntityEditor: loggedInAndSignedUpMiddleware(() => {
      throw new Error("`addEntityEditor` is not implemented");
    }),
    removeEntityEditor: loggedInAndSignedUpMiddleware(() => {
      throw new Error("`removeEntityEditor` is not implemented");
    }),
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

    createFlowSchedule: loggedInAndSignedUpMiddleware(
      createFlowScheduleResolver,
    ),
    updateFlowSchedule: loggedInAndSignedUpMiddleware(
      updateFlowScheduleResolver,
    ),
    pauseFlowSchedule: loggedInAndSignedUpMiddleware(pauseFlowScheduleResolver),
    resumeFlowSchedule: loggedInAndSignedUpMiddleware(
      resumeFlowScheduleResolver,
    ),
    archiveFlowSchedule: loggedInAndSignedUpMiddleware(
      archiveFlowScheduleResolver,
    ),

    // Integration
    syncLinearIntegrationWithWebs: loggedInAndSignedUpMiddleware(
      syncLinearIntegrationWithWebsMutation,
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

  PendingOrgInvitation: {
    __resolveType(object: PendingOrgInvitation) {
      if ("email" in object) {
        return "PendingOrgInvitationByEmail";
      }

      return "PendingOrgInvitationByShortname";
    },
  },
};

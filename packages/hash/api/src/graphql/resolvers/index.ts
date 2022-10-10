import { JSONObjectResolver } from "graphql-scalars";

import { Entity } from "../apiTypes.gen";

import {
  aggregateEntity,
  createEntity,
  entity,
  entities,
  entityFields,
  updateEntity,
  transferEntity,
} from "./entity";
import { createLink } from "./link/createLink";
import { deleteLink } from "./link/deleteLink";
import { blocks, blockProperties, blockLinkedEntities } from "./block";
import {
  page,
  pageProperties,
  updatePage,
  updatePageContents,
  searchPages,
  pageLinkedEntities,
} from "./pages";
import { commentLinkedEntities, textUpdatedAtFieldResolver } from "./comments";
import { accounts } from "./account/accounts";
import { createUser } from "./user/createUser";
import { createUserWithOrgEmailInvitation } from "./user/createUserWithOrgEmailInvitation";
import { updateUser } from "./user/updateUser";
import { createOrg } from "./org/createOrg";
import { orgLinkedEntities } from "./org/linkedEntities";
import { accountSignupComplete } from "./user/accountSignupComplete";
import { sendLoginCode } from "./user/sendLoginCode";
import { userLinkedEntities } from "./user/linkedEntities";
import { orgMembershipLinkedEntities } from "./orgMembership/linkedEntities";
import { embedCode } from "./embed";
import {
  getImpliedEntityHistory,
  getImpliedEntityVersion,
} from "./entity/impliedHistory";

import { me } from "./user/me";
import { isShortnameTaken } from "./user/isShortnameTaken";
import { deprecatedCreateEntityType } from "./entityType/createEntityType";
import { SYSTEM_TYPES, SystemType } from "../../types/entityTypes";
import { entityTypeTypeFields } from "./entityType/entityTypeTypeFields";
import { entityTypeInheritance } from "./entityType/entityTypeInheritance";
import { deprecatedGetAccountEntityTypes } from "./entityType/getAccountEntityTypes";
import { deprecatedGetEntityType } from "./entityType/getEntityType";
import { createOrgEmailInvitation } from "./org/createOrgEmailInvitation";
import { getOrgEmailInvitation } from "./org/getOrgEmailInvitation";
import { getOrgInvitationLink } from "./org/getOrgInvitationLink";
import { joinOrg } from "./user/joinOrg";
import { fileFields } from "./file";
import { requestFileUpload } from "./file/requestFileUpload";
import { createFileFromLink } from "./file/createFileFromLink";
import { loggedIn } from "./middlewares/loggedIn";
import { loggedInAndSignedUp } from "./middlewares/loggedInAndSignedUp";
import { canAccessAccount } from "./middlewares/canAccessAccount";
import { deprecatedUpdateEntityType } from "./entityType/updateEntityType";
import { deleteLinkedAggregation } from "./linkedAggregation/deleteLinkedAggregation";
import { updateLinkedAggregationOperation } from "./linkedAggregation/updateLinkedAggregationOperation";
import { createLinkedAggregation } from "./linkedAggregation/createLinkedAggregation";
import { linkedAggregationResults } from "./linkedAggregation/linkedAggregationResults";
import { orgEmailInvitationLinkedEntities } from "./orgEmailInvitation/linkedEntities";
import { orgInvitationLinkLinkedEntities } from "./orgInvitationLink/linkedEntities";
import { pageSearchResultConnection } from "./paginationConnection/pageSearchResultConnection";
import {
  executeDemoTask,
  executeGithubSpecTask,
  executeGithubCheckTask,
  executeGithubDiscoverTask,
  executeGithubReadTask,
} from "./taskExecutor";
import { getLink } from "./link/getLink";
import { getLinkedAggregation } from "./linkedAggregation/getLinkedAggregation";
import { getAllLatestDataTypes, getDataType } from "./ontology/data-type";
import {
  createPropertyType,
  getAllLatestPropertyTypes,
  getPropertyType,
  updatePropertyType,
} from "./ontology/property-type";
import {
  createLinkType,
  getAllLatestLinkTypes,
  getLinkType,
  updateLinkType,
} from "./ontology/link-type";

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
} from "./knowledge/page/page";
import {
  createPersistedComment,
  persistedPageComments,
} from "./knowledge/comment/comment";
import { persistedBlocks } from "./knowledge/block/block";
import { getBlockProtocolBlocks } from "./blockprotocol/getBlock";
import {
  createPersistedEntity,
  persistedEntity,
  updatePersistedEntity,
} from "./knowledge/entity/entity";
import { UnresolvedPersistedEntityGQL } from "./knowledge/model-mapping";
import {
  createPersistedLink,
  deletePersistedLink,
  outgoingPersistedLinks,
} from "./knowledge/link/link";
import { setParentPersistedPage } from "./knowledge/page/set-parent-page";
import { updatePersistedPage } from "./knowledge/page/update-page";
import { dataEntity } from "./knowledge/block/data-entity";
import { persistedCommentHasText } from "./knowledge/comment/has-text";
import { persistedCommentTextUpdatedAt } from "./knowledge/comment/text-updated-at";
import { persistedCommentReplies } from "./knowledge/comment/replies";
import { persistedCommentParent } from "./knowledge/comment/parent";
import { persistedCommentAuthor } from "./knowledge/comment/author";

/**
 * @todo: derive these from the statically declared workspace type names
 * @see https://app.asana.com/0/1202805690238892/1203063463721797/f
 */
const workpsaceEntityGQLTypeNames = [
  "PersistedPage",
  "PersistedBlock",
] as const;

type WorkspaceEntityGQLTypeName = typeof workpsaceEntityGQLTypeNames[number];

const isWorkspaceEntityGQLTypeName = (
  name: string,
): name is WorkspaceEntityGQLTypeName =>
  workpsaceEntityGQLTypeNames.includes(name as WorkspaceEntityGQLTypeName);

export const resolvers = {
  Query: {
    // Logged in and signed up users only
    accounts:
      loggedInAndSignedUp(
        accounts,
      ) /** @todo: make accessible to admins only (or deprecate) */,
    aggregateEntity: loggedInAndSignedUp(aggregateEntity),
    blocks: loggedInAndSignedUp(blocks),
    deprecatedGetAccountEntityTypes: loggedInAndSignedUp(
      deprecatedGetAccountEntityTypes,
    ),
    getBlockProtocolBlocks,
    entity: loggedInAndSignedUp(entity),
    entities: loggedInAndSignedUp(canAccessAccount(entities)),
    deprecatedGetEntityType: loggedInAndSignedUp(deprecatedGetEntityType),
    getLink: loggedInAndSignedUp(getLink),
    getLinkedAggregation: loggedInAndSignedUp(getLinkedAggregation),
    page: canAccessAccount(page),
    getImpliedEntityHistory: loggedInAndSignedUp(getImpliedEntityHistory),
    getImpliedEntityVersion: loggedInAndSignedUp(getImpliedEntityVersion),
    searchPages: loggedInAndSignedUp(searchPages),
    // Logged in users only
    me: loggedIn(me),
    // Any user
    getOrgEmailInvitation,
    getOrgInvitationLink,
    isShortnameTaken,
    embedCode,
    pageSearchResultConnection,
    // Ontology
    getAllLatestDataTypes: loggedInAndSignedUp(getAllLatestDataTypes),
    getDataType: loggedInAndSignedUp(getDataType),
    getAllLatestPropertyTypes: loggedInAndSignedUp(getAllLatestPropertyTypes),
    getPropertyType: loggedInAndSignedUp(getPropertyType),
    getAllLatestLinkTypes: loggedInAndSignedUp(getAllLatestLinkTypes),
    getLinkType: loggedInAndSignedUp(getLinkType),
    getAllLatestEntityTypes: loggedInAndSignedUp(getAllLatestEntityTypes),
    getEntityType: loggedInAndSignedUp(getEntityType),
    // Knowledge
    persistedPage: loggedInAndSignedUp(persistedPage),
    persistedPages: loggedInAndSignedUp(persistedPages),
    persistedPageComments: loggedInAndSignedUp(persistedPageComments),
    persistedBlocks: loggedInAndSignedUp(persistedBlocks),
    persistedEntity: loggedInAndSignedUp(persistedEntity),
    outgoingPersistedLinks: loggedInAndSignedUp(outgoingPersistedLinks),
  },

  Mutation: {
    // Logged in and signed up users only
    createEntity: loggedInAndSignedUp(createEntity),
    createLink: loggedInAndSignedUp(createLink),
    deleteLink: loggedInAndSignedUp(deleteLink),
    createLinkedAggregation: loggedInAndSignedUp(createLinkedAggregation),
    updateLinkedAggregationOperation: loggedInAndSignedUp(
      updateLinkedAggregationOperation,
    ),
    deleteLinkedAggregation: loggedInAndSignedUp(deleteLinkedAggregation),
    deprecatedCreateEntityType: loggedInAndSignedUp(deprecatedCreateEntityType),
    createFileFromLink: loggedInAndSignedUp(createFileFromLink),
    createOrg: loggedInAndSignedUp(createOrg),
    createOrgEmailInvitation: loggedInAndSignedUp(createOrgEmailInvitation),
    transferEntity: loggedInAndSignedUp(transferEntity),
    updateEntity: loggedInAndSignedUp(updateEntity),
    deprecatedUpdateEntityType: loggedInAndSignedUp(deprecatedUpdateEntityType),
    updatePage: loggedInAndSignedUp(updatePage),
    updatePageContents: loggedInAndSignedUp(updatePageContents),
    updatePersistedPageContents: loggedInAndSignedUp(
      updatePersistedPageContents,
    ),
    joinOrg: loggedInAndSignedUp(joinOrg),
    requestFileUpload: loggedInAndSignedUp(requestFileUpload),
    // Logged in users only
    updateUser: loggedIn(updateUser),
    // Any user
    createUser,
    createUserWithOrgEmailInvitation,
    sendLoginCode,
    // Task execution
    executeDemoTask,
    executeGithubSpecTask,
    executeGithubCheckTask,
    executeGithubDiscoverTask: loggedInAndSignedUp(executeGithubDiscoverTask),
    executeGithubReadTask: loggedInAndSignedUp(executeGithubReadTask),
    // Ontology
    createPropertyType: loggedInAndSignedUp(createPropertyType),
    updatePropertyType: loggedInAndSignedUp(updatePropertyType),
    createLinkType: loggedInAndSignedUp(createLinkType),
    updateLinkType: loggedInAndSignedUp(updateLinkType),
    createEntityType: loggedInAndSignedUp(createEntityType),
    updateEntityType: loggedInAndSignedUp(updateEntityType),
    // Knowledge
    createPersistedEntity: loggedInAndSignedUp(createPersistedEntity),
    updatePersistedEntity: loggedInAndSignedUp(updatePersistedEntity),
    createPersistedLink: loggedInAndSignedUp(createPersistedLink),
    deletePersistedLink: loggedInAndSignedUp(deletePersistedLink),
    createPersistedPage: loggedInAndSignedUp(createPersistedPage),
    setParentPersistedPage: loggedInAndSignedUp(setParentPersistedPage),
    updatePersistedPage: loggedInAndSignedUp(updatePersistedPage),
    createPersistedComment: loggedInAndSignedUp(createPersistedComment),
  },

  JSONObject: JSONObjectResolver,

  Block: {
    properties:
      blockProperties /** @todo: remove this resolver as it is deprecated */,
    ...blockLinkedEntities,
  },

  Page: {
    properties:
      pageProperties /** @todo: remove this resolver as it is deprecated */,
    ...pageLinkedEntities,
  },

  Comment: {
    properties: {
      ...entityFields.properties,
    },
    textUpdatedAt: textUpdatedAtFieldResolver,
    ...commentLinkedEntities,
  },

  User: {
    accountSignupComplete,
    ...userLinkedEntities,
  },

  Org: {
    ...orgLinkedEntities,
  },

  OrgMembership: {
    properties: entityFields.properties,
    ...orgMembershipLinkedEntities,
  },

  FileProperties: {
    url: fileFields.url,
  },

  OrgEmailInvitation: {
    properties: entityFields.properties,
    ...orgEmailInvitationLinkedEntities,
  },

  OrgInvitationLink: {
    properties: entityFields.properties,
    ...orgInvitationLinkLinkedEntities,
  },

  UnknownEntity: {
    properties: entityFields.properties,
  },

  Entity: {
    __resolveType({ entityTypeName }: Entity) {
      // @todo this should also check if the type is in the HASH account
      //    otherwise it'll catch User, Org etc types in other accounts
      //    which may have a different structure to the HASH one.
      //    should also extract this check (e.g. to src/types/entityTypes).
      if (SYSTEM_TYPES.includes(entityTypeName as SystemType)) {
        return entityTypeName;
      }
      return "UnknownEntity";
    },
    history: entityFields.history,
    linkGroups: entityFields.linkGroups,
    linkedEntities: entityFields.linkedEntities,
    linkedAggregations: entityFields.linkedAggregations,
  },

  LinkedAggregation: {
    results: linkedAggregationResults,
  },

  DeprecatedEntityType: {
    entityType: entityTypeTypeFields.entityType,
    entityTypeId: entityTypeTypeFields.entityTypeId,
    entityTypeName: entityTypeTypeFields.entityTypeName,
    entityTypeVersionId: entityTypeTypeFields.entityTypeVersionId,

    ...entityTypeInheritance,
  },

  Account: {
    __resolveType({ entityTypeName }: Entity) {
      return entityTypeName;
    },
  },

  // New knowledge field resolvers

  PersistedEntity: {
    /**
     * Determines whether a `PersistedEntity` instance should be treated as a
     * workspace GQL type definition (for example as a `PersistedPage`), or
     * whether to treat it is an `UnknownPersistedEntity`.
     */
    __resolveType: ({
      workspaceTypeName,
    }: UnresolvedPersistedEntityGQL):
      | WorkspaceEntityGQLTypeName
      | "UnknownPersistedEntity" => {
      const workspaceEntityGQLTypeName = workspaceTypeName
        ? `Persisted${workspaceTypeName.split(" ").join("")}`
        : undefined;

      return workspaceEntityGQLTypeName &&
        isWorkspaceEntityGQLTypeName(workspaceEntityGQLTypeName)
        ? workspaceEntityGQLTypeName
        : "UnknownPersistedEntity";
    },
  },

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
    dataEntity,
  },

  /**
   * @todo Add Entity.linkedEntities field resolver for resolving linked entities
   *   PersistedEntity: { linkedEntities .. }
   *   see https://app.asana.com/0/0/1203057486837594/f
   */
};

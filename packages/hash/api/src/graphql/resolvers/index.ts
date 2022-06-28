import GraphQLJSON from "graphql-type-json";

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
  createPage,
  accountPages,
  page,
  pageProperties,
  updatePage,
  updatePageContents,
  searchPages,
  setParentPage,
  pageLinkedEntities,
} from "./pages";
import { accounts } from "./account/accounts";
import { createUser } from "./user/createUser";
import { createUserWithOrgEmailInvitation } from "./user/createUserWithOrgEmailInvitation";
import { updateUser } from "./user/updateUser";
import { createOrg } from "./org/createOrg";
import { orgLinkedEntities } from "./org/linkedEntities";
import { accountSignupComplete } from "./user/accountSignupComplete";
import { verifyEmail } from "./user/verifyEmail";
import { sendLoginCode } from "./user/sendLoginCode";
import { loginWithLoginCode } from "./user/loginWithLoginCode";
import { userLinkedEntities } from "./user/linkedEntities";
import { orgMembershipLinkedEntities } from "./orgMembership/linkedEntities";
import { embedCode } from "./embed";
import {
  getImpliedEntityHistory,
  getImpliedEntityVersion,
} from "./entity/impliedHistory";

import { logout } from "./user/logout";
import { me } from "./user/me";
import { isShortnameTaken } from "./user/isShortnameTaken";
import { createEntityType } from "./entityType/createEntityType";
import { SYSTEM_TYPES, SystemType } from "../../types/entityTypes";
import { entityTypeTypeFields } from "./entityType/entityTypeTypeFields";
import { entityTypeInheritance } from "./entityType/entityTypeInheritance";
import { getAccountEntityTypes } from "./entityType/getAccountEntityTypes";
import { getEntityType } from "./entityType/getEntityType";
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
import { updateEntityType } from "./entityType/updateEntityType";
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

export const resolvers = {
  Query: {
    // Logged in and signed up users only
    accountPages: loggedInAndSignedUp(accountPages),
    accounts:
      loggedInAndSignedUp(
        accounts,
      ) /** @todo: make accessible to admins only (or deprecate) */,
    aggregateEntity: loggedInAndSignedUp(aggregateEntity),
    blocks: loggedInAndSignedUp(blocks),
    getAccountEntityTypes: loggedInAndSignedUp(getAccountEntityTypes),
    entity: loggedInAndSignedUp(entity),
    entities: loggedInAndSignedUp(canAccessAccount(entities)),
    getEntityType: loggedInAndSignedUp(getEntityType),
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
    createEntityType: loggedInAndSignedUp(createEntityType),
    createFileFromLink: loggedInAndSignedUp(createFileFromLink),
    createPage: loggedInAndSignedUp(createPage),
    createOrg: loggedInAndSignedUp(createOrg),
    createOrgEmailInvitation: loggedInAndSignedUp(createOrgEmailInvitation),
    transferEntity: loggedInAndSignedUp(transferEntity),
    updateEntity: loggedInAndSignedUp(updateEntity),
    updateEntityType: loggedInAndSignedUp(updateEntityType),
    updatePage: loggedInAndSignedUp(updatePage),
    updatePageContents: loggedInAndSignedUp(updatePageContents),
    joinOrg: loggedInAndSignedUp(joinOrg),
    requestFileUpload: loggedInAndSignedUp(requestFileUpload),
    setParentPage: loggedInAndSignedUp(setParentPage),
    // Logged in users only
    updateUser: loggedIn(updateUser),
    logout: loggedIn(logout),
    // Any user
    createUser,
    createUserWithOrgEmailInvitation,
    verifyEmail,
    sendLoginCode,
    loginWithLoginCode,
    // Task execution
    executeDemoTask,
    executeGithubSpecTask,
    executeGithubCheckTask,
    executeGithubDiscoverTask: loggedInAndSignedUp(executeGithubDiscoverTask),
    executeGithubReadTask: loggedInAndSignedUp(executeGithubReadTask),
  },

  JSONObject: GraphQLJSON,
  TextToken: GraphQLJSON,

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

  User: {
    accountSignupComplete,
    properties: entityFields.properties,
    ...userLinkedEntities,
  },

  Org: {
    properties: entityFields.properties,
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

  EntityType: {
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
};

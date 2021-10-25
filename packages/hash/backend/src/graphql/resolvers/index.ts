import GraphQLJSON from "graphql-type-json";

import { ForbiddenError } from "apollo-server-express";
import { Entity } from "../apiTypes.gen";

import {
  aggregateEntity,
  createEntity,
  entity,
  entityFields,
  updateEntity,
} from "./entity";
import { createLink } from "./link/createLink";
import { blockFields } from "./block";
import {
  createPage,
  insertBlockIntoPage,
  insertBlocksIntoPage,
  accountPages,
  page,
  pageFields,
  updatePage,
  updatePageContents,
} from "./pages";
import { accounts } from "./account/accounts";
import { createUser } from "./user/createUser";
import { createUserWithOrgEmailInvitation } from "./user/createUserWithOrgEmailInvitation";
import { updateUser } from "./user/updateUser";
import { createOrg } from "./org/createOrg";
import { accountSignupComplete } from "./user/accountSignupComplete";
import { verifyEmail } from "./user/verifyEmail";
import { sendLoginCode } from "./user/sendLoginCode";
import { loginWithLoginCode } from "./user/loginWithLoginCode";
import { embedCode } from "./embed";
import {
  getImpliedEntityHistory,
  getImpliedEntityVersion,
} from "./entity/impliedHistory";

import { GraphQLContext, LoggedInGraphQLContext } from "../context";
import { logout } from "./user/logout";
import { me } from "./user/me";
import { isShortnameTaken } from "./user/isShortnameTaken";
import { createEntityType } from "./entityType/createEntityType";
import { SYSTEM_TYPES, SystemType } from "../../types/entityTypes";
import { entityTypeTypeFields } from "./entityType/entityTypeTypeFields";
import { getAccountEntityTypes } from "./entityType/getAccountEntityTypes";
import { getEntityType } from "./entityType/getEntityType";
import { createOrgEmailInvitation } from "./org/createOrgEmailInvitation";
import { getOrgEmailInvitation } from "./org/getOrgEmailInvitation";
import { getOrgInvitationLink } from "./org/getOrgInvitationLink";
import { joinOrg } from "./user/joinOrg";

const loggedIn =
  (next: any) => (obj: any, args: any, ctx: GraphQLContext, info: any) => {
    if (!ctx.user) {
      throw new ForbiddenError("You must be logged in to perform this action.");
    }
    return next(obj, args, ctx, info);
  };

const signedUp =
  (next: any) =>
  (obj: any, args: any, ctx: LoggedInGraphQLContext, info: any) => {
    if (!ctx.user.isAccountSignupComplete()) {
      throw new ForbiddenError(
        "You must complete the sign-up process to perform this action."
      );
    }
    return next(obj, args, ctx, info);
  };

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const loggedInAndSignedUp =
  (next: any) => (obj: any, args: any, ctx: GraphQLContext, info: any) =>
    loggedIn(signedUp(next))(obj, args, ctx, info);

export const resolvers = {
  Query: {
    // Logged in and signed up users only
    accountPages: loggedInAndSignedUp(accountPages),
    accounts:
      loggedInAndSignedUp(
        accounts
      ) /** @todo: make accessible to admins only (or deprecate) */,
    aggregateEntity: loggedInAndSignedUp(aggregateEntity),
    getAccountEntityTypes: loggedInAndSignedUp(getAccountEntityTypes),
    entity: loggedInAndSignedUp(entity),
    getEntityType: loggedInAndSignedUp(getEntityType),
    page: loggedInAndSignedUp(page),
    getImpliedEntityHistory: loggedInAndSignedUp(getImpliedEntityHistory),
    getImpliedEntityVersion: loggedInAndSignedUp(getImpliedEntityVersion),
    // Logged in users only
    me: loggedIn(me),
    // Any user
    getOrgEmailInvitation,
    getOrgInvitationLink,
    isShortnameTaken,
    embedCode,
  },

  Mutation: {
    // Logged in and signed up users only
    createEntity: loggedInAndSignedUp(createEntity),
    createLink: loggedInAndSignedUp(createLink),
    createEntityType: loggedInAndSignedUp(createEntityType),
    createPage: loggedInAndSignedUp(createPage),
    insertBlockIntoPage: loggedInAndSignedUp(insertBlockIntoPage),
    insertBlocksIntoPage: loggedInAndSignedUp(insertBlocksIntoPage),
    updateEntity: loggedInAndSignedUp(updateEntity),
    updatePage: loggedInAndSignedUp(updatePage),
    updatePageContents: loggedInAndSignedUp(updatePageContents),
    createOrg: loggedInAndSignedUp(createOrg),
    createOrgEmailInvitation: loggedInAndSignedUp(createOrgEmailInvitation),
    joinOrg: loggedInAndSignedUp(joinOrg),
    // Logged in users only
    updateUser: loggedIn(updateUser),
    logout: loggedIn(logout),
    // Any user
    createUser,
    createUserWithOrgEmailInvitation,
    verifyEmail,
    sendLoginCode,
    loginWithLoginCode,
  },

  JSONObject: GraphQLJSON,

  BlockProperties: {
    entity: blockFields.entity,
  },

  PageProperties: {
    contents: pageFields.contents,
  },

  User: {
    accountSignupComplete,
    properties: entityFields.properties,
  },

  Org: {
    properties: entityFields.properties,
  },

  OrgEmailInvitation: {
    properties: entityFields.properties,
  },

  OrgInvitationLink: {
    properties: entityFields.properties,
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
    links: entityFields.links,
    linkedEntities: entityFields.linkedEntities,
    linkedAggregations: entityFields.linkedAggregations,
  },

  EntityType: {
    entityType: entityTypeTypeFields.entityType,
    entityTypeId: entityTypeTypeFields.entityTypeId,
    entityTypeName: entityTypeTypeFields.entityTypeName,
    entityTypeVersionId: entityTypeTypeFields.entityTypeVersionId,
  },

  Account: {
    __resolveType({ entityTypeName }: Entity) {
      return entityTypeName;
    },
  },
};

import GraphQLJSON from "graphql-type-json";

import { Entity } from "../apiTypes.gen";
// import { entityAccountName } from "./shared/account";
import {
  aggregateEntity,
  createEntity,
  entity,
  entityFields,
  updateEntity,
} from "./entity";
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

import { GraphQLContext, LoggedInGraphQLContext } from "../context";
import { ForbiddenError } from "apollo-server-express";
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
    // Logged in users only
    getOrgEmailInvitation: loggedIn(getOrgEmailInvitation),
    getOrgInvitationLink: loggedIn(getOrgInvitationLink),
    me: loggedIn(me),
    // Any user
    isShortnameTaken,
    embedCode,
  },

  Mutation: {
    // Logged in and signed up users only
    createEntity: loggedInAndSignedUp(createEntity),
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
    __resolveType(entity: Entity) {
      // @todo this should also check if the type is in the HASH account
      //    otherwise it'll catch User, Org etc types in other accounts
      //    which may have a different structure to the HASH one.
      //    should also extract this check (e.g. to src/types/entityTypes).
      if (SYSTEM_TYPES.includes(entity.entityTypeName as SystemType)) {
        return entity.entityTypeName;
      }
      return "UnknownEntity";
    },
    history: entityFields.history,
  },

  EntityType: {
    entityType: entityTypeTypeFields.entityType,
    entityTypeId: entityTypeTypeFields.entityTypeId,
    entityTypeName: entityTypeTypeFields.entityTypeName,
    entityTypeVersionId: entityTypeTypeFields.entityTypeVersionId,
  },

  Account: {
    __resolveType(entity: Entity) {
      return entity.entityTypeName;
    },
  },
};

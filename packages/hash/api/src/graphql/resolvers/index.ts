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
import {
  createComment,
  commentLinkedEntities,
  textUpdatedAtFieldResolver,
} from "./comments";
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
  updateKnowledgePageContents,
  knowledgePageContents,
} from "./knowledge/page";
import { knowledgePage } from "./knowledge/page/page";
import { knowledgeBlocks } from "./knowledge/block/block";
import { getBlockProtocolBlocks } from "./blockprotocol/getBlock";
import {
  createKnowledgeEntity,
  knowledgeEntity,
} from "./knowledge/entity/entity";
import { UnresolvedKnowledgeEntityGQL } from "./knowledge/model-mapping";
import {
  createKnowledgeLink,
  deleteKnowledgeLink,
  outgoingKnowledgeLinks,
} from "./knowledge/link/link";

/**
 * @todo: derive these from the statically declared workspace type names
 * @see https://app.asana.com/0/1202805690238892/1203063463721797/f
 */
const workpsaceEntityGQLTypeNames = [
  "KnowledgePage",
  "KnowledgeBlock",
] as const;

type WorkspaceEntityGQLTypeName = typeof workpsaceEntityGQLTypeNames[number];

const isWorkspaceEntityGQLTypeName = (
  name: string,
): name is WorkspaceEntityGQLTypeName =>
  workpsaceEntityGQLTypeNames.includes(name as WorkspaceEntityGQLTypeName);

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
    knowledgePage: loggedInAndSignedUp(knowledgePage),
    knowledgeBlocks: loggedInAndSignedUp(knowledgeBlocks),
    knowledgeEntity: loggedInAndSignedUp(knowledgeEntity),
    outgoingKnowledgeLinks: loggedInAndSignedUp(outgoingKnowledgeLinks),
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
    createPage: loggedInAndSignedUp(createPage),
    createComment: loggedInAndSignedUp(createComment),
    createOrg: loggedInAndSignedUp(createOrg),
    createOrgEmailInvitation: loggedInAndSignedUp(createOrgEmailInvitation),
    transferEntity: loggedInAndSignedUp(transferEntity),
    updateEntity: loggedInAndSignedUp(updateEntity),
    deprecatedUpdateEntityType: loggedInAndSignedUp(deprecatedUpdateEntityType),
    updatePage: loggedInAndSignedUp(updatePage),
    updatePageContents: loggedInAndSignedUp(updatePageContents),
    updateKnowledgePageContents: loggedInAndSignedUp(
      updateKnowledgePageContents,
    ),
    joinOrg: loggedInAndSignedUp(joinOrg),
    requestFileUpload: loggedInAndSignedUp(requestFileUpload),
    setParentPage: loggedInAndSignedUp(setParentPage),
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
    createKnowledgeEntity: loggedInAndSignedUp(createKnowledgeEntity),
    createKnowledgeLink: loggedInAndSignedUp(createKnowledgeLink),
    deleteKnowledgeLink: loggedInAndSignedUp(deleteKnowledgeLink),
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

  KnowledgeEntity: {
    /**
     * Determines whether a `KnowledgeEntity` instance should be treated as a
     * workspace GQL type definition (for example as a `KnowledgePage`), or
     * whether to treat it is an `UnknownKnowledgeEntity`.
     */
    __resolveType: ({
      workspaceTypeName,
    }: UnresolvedKnowledgeEntityGQL):
      | WorkspaceEntityGQLTypeName
      | "UnknownKnowledgeEntity" => {
      const workspaceEntityGQLTypeName = workspaceTypeName
        ? `Knowledge${workspaceTypeName.split(" ").join("")}`
        : undefined;

      return workspaceEntityGQLTypeName &&
        isWorkspaceEntityGQLTypeName(workspaceEntityGQLTypeName)
        ? workspaceEntityGQLTypeName
        : "UnknownKnowledgeEntity";
    },
  },

  KnowledgePage: {
    contents: knowledgePageContents,
  },

  /**
   * @todo Add Entity.linkedEntities field resolver for resolving linked entities
   *   KnowledgeEntity: { linkedEntities .. }
   *   see https://app.asana.com/0/0/1203057486837594/f
   */
};

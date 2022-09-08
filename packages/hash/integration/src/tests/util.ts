import { print } from "graphql/language/printer";
import { GraphQLClient, ClientError } from "graphql-request";
import { createKratosIdentity } from "@hashintel/hash-api/src/auth/ory-kratos";
import { GraphApi } from "@hashintel/hash-api/src/graph";
import { UserModel } from "@hashintel/hash-api/src/model";
import { workspaceAccountId } from "@hashintel/hash-api/src/model/util";
import { ensureWorkspaceTypesExist } from "@hashintel/hash-api/src/graph/workspace-types";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import {
  createLinkedAggregation,
  deleteLinkedAggregation,
  updateLinkedAggregationOperation,
} from "../graphql/queries/aggregation.queries";
import {
  SendLoginCodeMutation,
  SendLoginCodeMutationVariables,
  CreateEntityMutation,
  CreateEntityMutationVariables,
  CreateOrgMutation,
  CreateOrgMutationVariables,
  CreatePageMutation,
  CreatePageMutationVariables,
  CreateUserMutation,
  CreateUserMutationVariables,
  LoginWithLoginCodeMutationVariables,
  LoginWithLoginCodeMutation,
  GetEntityQueryVariables,
  GetEntityQuery,
  UpdateEntityMutationVariables,
  UpdateEntityMutation,
  GetPageQueryVariables,
  GetPageQuery,
  UpdatePageContentsMutation,
  UpdatePageContentsMutationVariables,
  DeprecatedCreateEntityTypeMutation,
  DeprecatedCreateEntityTypeMutationVariables,
  DeprecatedUpdateEntityTypeMutation,
  DeprecatedUpdateEntityTypeMutationVariables,
  CreateOrgEmailInvitationMutationVariables,
  CreateOrgEmailInvitationMutation,
  CreateUserWithOrgEmailInvitationMutationVariables,
  CreateUserWithOrgEmailInvitationMutation,
  GetOrgEmailInvitationQueryVariables,
  GetOrgEmailInvitationQuery,
  GetOrgInvitationLinkQueryVariables,
  GetOrgInvitationLinkQuery,
  JoinOrgMutationVariables,
  JoinOrgMutation,
  CreateLinkedAggregationMutationVariables,
  CreateLinkedAggregationMutation,
  UpdateLinkedAggregationOperationMutation,
  UpdateLinkedAggregationOperationMutationVariables,
  DeleteLinkedAggregationMutation,
  DeleteLinkedAggregationMutationVariables,
  QueryDeprecatedGetEntityTypeArgs,
  Query,
  GetEntitiesQuery,
  GetEntitiesQueryVariables,
  GetEntityAndLinksQueryVariables,
  GetEntityAndLinksQuery,
  SetParentPageMutationVariables,
  SetParentPageMutation,
  GetAccountPagesTreeQueryVariables,
  GetAccountPagesTreeQuery,
} from "../graphql/apiTypes.gen";
import {
  createEntity,
  deprecatedCreateEntityType,
  deprecatedGetEntityType,
  deprecatedGetEntityTypeAllParents,
  getUnknownEntity,
  getEntities,
  updateEntity,
  deprecatedUpdateEntityType,
  getEntityAndLinks,
} from "../graphql/queries/entity.queries";
import {
  createOrg,
  createOrgEmailInvitation,
  joinOrg,
  orgEmailInvitation,
  orgInvitationLink,
} from "../graphql/queries/org.queries";
import {
  createUser,
  createUserWithOrgEmailInvitation,
  loginWithLoginCode,
  sendLoginCode,
} from "../graphql/queries/user.queries";
import {
  createPage,
  getAccountPagesTree,
  getPage,
  setPageParent,
  updatePageContents,
} from "../graphql/queries/page.queries";

const randomStringSuffix = () => {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  return new Array(6)
    .fill(undefined)
    .map(() => alphabet[Math.floor(Math.random() * alphabet.length)])
    .join("");
};

export const createTestUser = async (
  graphApi: GraphApi,
  shortNamePrefix: string,
  logger: Logger,
) => {
  await ensureWorkspaceTypesExist({ graphApi, logger });

  const shortname = `${shortNamePrefix}${randomStringSuffix()}`;

  const identity = await createKratosIdentity({
    traits: {
      shortname,
      emails: [`${shortname}@example.com`],
    },
  }).catch((err) => {
    logger.error(`Error when creating Kratos Identity, ${shortname}: ${err}`);
    throw err;
  });

  const kratosIdentityId = identity.id;

  const createdUser = await UserModel.createUser(graphApi, {
    emails: [`${shortname}@example.com`],
    kratosIdentityId,
  }).catch((err) => {
    logger.error(`Error making UserModel for ${shortname}`);
    throw err;
  });

  const updatedUser = await createdUser
    .updateShortname(graphApi, {
      updatedByAccountId: workspaceAccountId,
      updatedShortname: shortname,
    })
    .catch((err) => {
      logger.error(`Error updating shortname for UserModel to ${shortname}`);
      throw err;
    });

  return updatedUser.getAccountId();
};

export class ApiClient {
  private client: GraphQLClient;

  constructor(url: string) {
    this.client = new GraphQLClient(url);
  }

  static getErrorCodesFromClientError = (clientError: ClientError) => {
    if (!clientError.response.errors) {
      throw new Error("No response errors found on client error");
    }
    return clientError.response.errors.map(
      (error: any) => error.extensions.code,
    );
  };

  setCookie = (cookie: string) => this.client.setHeader("Cookie", cookie);

  removeCookie = () => this.client.setHeader("Cookie", "");

  /** Sign-up related requests */

  createUser = async (vars: CreateUserMutationVariables) =>
    this.client
      .request<CreateUserMutation, CreateUserMutationVariables>(
        createUser,
        vars,
      )
      .then((res) => res.createUser);

  createUserWithOrgEmailInvitation = async (
    vars: CreateUserWithOrgEmailInvitationMutationVariables,
  ) =>
    this.client
      .request<
        CreateUserWithOrgEmailInvitationMutation,
        CreateUserWithOrgEmailInvitationMutationVariables
      >(createUserWithOrgEmailInvitation, vars)
      .then((res) => res.createUserWithOrgEmailInvitation);

  /** Log-in related requests */

  async sendLoginCode(vars: SendLoginCodeMutationVariables) {
    return (
      await this.client.request<
        SendLoginCodeMutation,
        SendLoginCodeMutationVariables
      >(sendLoginCode, vars)
    ).sendLoginCode;
  }

  async loginWithLoginCode(vars: LoginWithLoginCodeMutationVariables) {
    const { data, headers } = await this.client.rawRequest<
      LoginWithLoginCodeMutation,
      LoginWithLoginCodeMutationVariables
    >(print(loginWithLoginCode), vars);

    if (!data) {
      throw new Error("loginWithLoginCode mutation did not return data");
    }

    return { user: data.loginWithLoginCode, responseHeaders: headers };
  }

  /** Other requests */

  getUnknownEntity = async (vars: GetEntityQueryVariables) =>
    this.client
      .request<GetEntityQuery, GetEntityQueryVariables>(getUnknownEntity, vars)
      .then((res) => res.entity);

  getEntityAndLinks = async (vars: GetEntityAndLinksQueryVariables) =>
    this.client
      .request<GetEntityAndLinksQuery, GetEntityAndLinksQueryVariables>(
        getEntityAndLinks,
        vars,
      )
      .then((res) => res.entity);

  getEntities = async (vars: GetEntitiesQueryVariables) =>
    this.client.request<GetEntitiesQuery, GetEntitiesQueryVariables>(
      getEntities,
      vars,
    );

  updateEntity = async (vars: UpdateEntityMutationVariables) =>
    this.client
      .request<UpdateEntityMutation, UpdateEntityMutationVariables>(
        updateEntity,
        vars,
      )
      .then((res) => res.updateEntity);

  async createEntity(vars: CreateEntityMutationVariables) {
    return (
      await this.client.request<
        CreateEntityMutation,
        CreateEntityMutationVariables
      >(createEntity, vars)
    ).createEntity;
  }

  async createOrg(vars: CreateOrgMutationVariables) {
    return (
      await this.client.request<CreateOrgMutation, CreateOrgMutationVariables>(
        createOrg,
        vars,
      )
    ).createOrg;
  }

  async createOrgEmailInvitation(
    vars: CreateOrgEmailInvitationMutationVariables,
  ) {
    return (
      await this.client.request<
        CreateOrgEmailInvitationMutation,
        CreateOrgEmailInvitationMutationVariables
      >(createOrgEmailInvitation, vars)
    ).createOrgEmailInvitation;
  }

  async getOrgEmailInvitation(vars: GetOrgEmailInvitationQueryVariables) {
    return (
      await this.client.request<
        GetOrgEmailInvitationQuery,
        GetOrgEmailInvitationQueryVariables
      >(orgEmailInvitation, vars)
    ).getOrgEmailInvitation;
  }

  async getOrgInvitationLink(vars: GetOrgInvitationLinkQueryVariables) {
    return (
      await this.client.request<
        GetOrgInvitationLinkQuery,
        GetOrgInvitationLinkQueryVariables
      >(orgInvitationLink, vars)
    ).getOrgInvitationLink;
  }

  async joinOrg(vars: JoinOrgMutationVariables) {
    return (
      await this.client.request<JoinOrgMutation, JoinOrgMutationVariables>(
        joinOrg,
        vars,
      )
    ).joinOrg;
  }

  async createPage(vars: CreatePageMutationVariables) {
    return (
      await this.client.request<
        CreatePageMutation,
        CreatePageMutationVariables
      >(createPage, vars)
    ).createPage;
  }

  async setParentPage(vars: SetParentPageMutationVariables) {
    return (
      await this.client.request<
        SetParentPageMutation,
        SetParentPageMutationVariables
      >(setPageParent, vars)
    ).setParentPage;
  }

  async deprecatedGetEntityType(vars: QueryDeprecatedGetEntityTypeArgs) {
    return (
      await this.client.request<
        Pick<Query, "deprecatedGetEntityType">,
        QueryDeprecatedGetEntityTypeArgs
      >(deprecatedGetEntityType, vars)
    ).deprecatedGetEntityType;
  }

  async getEntityTypeAllParents(vars: QueryDeprecatedGetEntityTypeArgs) {
    return (
      await this.client.request<
        Pick<Query, "deprecatedGetEntityType">,
        QueryDeprecatedGetEntityTypeArgs
      >(deprecatedGetEntityTypeAllParents, vars)
    ).deprecatedGetEntityType;
  }

  async deprecatedCreateEntityType(
    vars: DeprecatedCreateEntityTypeMutationVariables,
  ) {
    return (
      await this.client.request<
        DeprecatedCreateEntityTypeMutation,
        DeprecatedCreateEntityTypeMutationVariables
      >(deprecatedCreateEntityType, vars)
    ).deprecatedCreateEntityType;
  }

  async deprecatedUpdateEntityType(
    vars: DeprecatedUpdateEntityTypeMutationVariables,
  ) {
    return (
      await this.client.request<
        DeprecatedUpdateEntityTypeMutation,
        DeprecatedUpdateEntityTypeMutationVariables
      >(deprecatedUpdateEntityType, vars)
    ).deprecatedUpdateEntityType;
  }

  getPage = async (vars: GetPageQueryVariables) =>
    this.client
      .request<GetPageQuery, GetPageQueryVariables>(getPage, vars)
      .then((res) => res.page);

  getAccountPagesTree = async (vars: GetAccountPagesTreeQueryVariables) =>
    this.client
      .request<GetAccountPagesTreeQuery, GetAccountPagesTreeQueryVariables>(
        getAccountPagesTree,
        vars,
      )
      .then((res) => res.accountPages);

  updatePageContents = async (vars: UpdatePageContentsMutationVariables) =>
    this.client
      .request<UpdatePageContentsMutation, UpdatePageContentsMutationVariables>(
        updatePageContents,
        vars,
      )
      .then((res) => res.updatePageContents.page);

  createLinkedAggregation = async (
    vars: CreateLinkedAggregationMutationVariables,
  ) =>
    this.client
      .request<
        CreateLinkedAggregationMutation,
        CreateLinkedAggregationMutationVariables
      >(createLinkedAggregation, vars)
      .then((res) => res.createLinkedAggregation);

  updateLinkedAggregationOperation = async (
    vars: UpdateLinkedAggregationOperationMutationVariables,
  ) =>
    this.client
      .request<
        UpdateLinkedAggregationOperationMutation,
        UpdateLinkedAggregationOperationMutationVariables
      >(updateLinkedAggregationOperation, vars)
      .then((res) => res.updateLinkedAggregationOperation);

  deleteLinkedAggregation = async (
    vars: DeleteLinkedAggregationMutationVariables,
  ) =>
    this.client
      .request<
        DeleteLinkedAggregationMutation,
        DeleteLinkedAggregationMutationVariables
      >(deleteLinkedAggregation, vars)
      .then((res) => res.deleteLinkedAggregation);
}

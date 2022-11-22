import { GraphQLClient, ClientError } from "graphql-request";
import { createKratosIdentity } from "@hashintel/hash-api/src/auth/ory-kratos";
import { GraphApi } from "@hashintel/hash-api/src/graph";
import { OrgModel, UserModel } from "@hashintel/hash-api/src/model";
import { ensureSystemTypesExist } from "@hashintel/hash-api/src/graph/system-types";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { systemAccountId } from "@hashintel/hash-api/src/model/util";
import {
  createLinkedAggregation,
  deleteLinkedAggregation,
  updateLinkedAggregationOperation,
} from "../graphql/queries/aggregation.queries";
import {
  CreateEntityMutation,
  CreateEntityMutationVariables,
  CreatePageMutation,
  CreatePageMutationVariables,
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
  OrgSize,
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

export const generateRandomShortname = (prefix?: string) =>
  `${prefix ?? ""}${randomStringSuffix()}`;

export const createTestUser = async (
  graphApi: GraphApi,
  shortNamePrefix: string,
  logger: Logger,
) => {
  await ensureSystemTypesExist({ graphApi, logger });

  const shortname = generateRandomShortname(shortNamePrefix);

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
    actorId: systemAccountId,
  }).catch((err) => {
    logger.error(`Error making UserModel for ${shortname}`);
    throw err;
  });

  const updatedUser = await createdUser
    .updateShortname(graphApi, {
      updatedShortname: shortname,
      actorId: createdUser.getEntityUuid(),
    })
    .catch((err) => {
      logger.error(`Error updating shortname for UserModel to ${shortname}`);
      throw err;
    });

  return updatedUser;
};

export const createTestOrg = async (
  graphApi: GraphApi,
  shortNamePrefix: string,
  logger: Logger,
) => {
  await ensureSystemTypesExist({ graphApi, logger });

  const shortname = generateRandomShortname(shortNamePrefix);

  const createdOrg = await OrgModel.createOrg(graphApi, {
    name: "Test org",
    shortname,
    providedInfo: {
      orgSize: OrgSize.ElevenToFifty,
    },
    actorId: systemAccountId,
  });

  return createdOrg;
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

  async createPage(vars: CreatePageMutationVariables) {
    return (
      await this.client.request<
        CreatePageMutation,
        CreatePageMutationVariables
      >(createPage, vars)
    ).createPersistedPage;
  }

  async setParentPage(vars: SetParentPageMutationVariables) {
    return (
      await this.client.request<
        SetParentPageMutation,
        SetParentPageMutationVariables
      >(setPageParent, vars)
    ).setParentPersistedPage;
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
      .then((res) => res.persistedPages);

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

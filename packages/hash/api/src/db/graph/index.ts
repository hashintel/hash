/* eslint-disable @typescript-eslint/no-unused-vars */

import { DataSource } from "apollo-datasource";
import {
  Configuration,
  GraphApi,
  PropertyType,
} from "@hashintel/hash-graph-client";
import HttpAgent, { HttpsAgent } from "agentkeepalive";
import axios from "axios";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import {
  DbAggregation,
  DbClient,
  DbEntity,
  DbLink,
  EntityMeta,
  EntityType,
  EntityVersion,
  Graph,
  VerificationCode,
} from "../adapter";
import { SystemType } from "../../types/entityTypes";

const httpAgent = new HttpAgent({
  maxSockets: 128,
  maxFreeSockets: 20,
  timeout: 60 * 1000, // ms
  freeSocketTimeout: 30 * 1000, // ms
});

const httpsAgent = new HttpsAgent({
  maxSockets: 128,
  maxFreeSockets: 128,
  timeout: 60000,
  freeSocketTimeout: 30000,
});

export class GraphAdapter extends DataSource implements DbClient {
  private graphApi: GraphApi;

  constructor({ basePath }: { basePath: string }, logger: Logger) {
    super();
    const axiosInstance = axios.create({
      httpAgent,
      httpsAgent,
    });

    const config = new Configuration({ basePath });

    this.graphApi = new GraphApi(config, basePath, axiosInstance);
  }

  createPropertyType(params: {
    accountId: string;
    schema: PropertyType;
  }): Promise<PropertyType> {
    return this.graphApi
      .createPropertyType({
        account_id: params.accountId,
        schema: params.schema,
      })
      .then((response) => response.data);
  }

  getLatestPropertyTypes(_params: {
    accountId: string;
  }): Promise<PropertyType[]> {
    return this.graphApi
      .getLatestPropertyTypes()
      .then((response) => response.data);
  }

  getPropertyType(params: {
    accountId: string;
    versionedUri: string;
  }): Promise<PropertyType> {
    return this.graphApi
      .getPropertyType(params.versionedUri)
      .then((response) => response.data);
  }

  updatePropertyType(params: {
    accountId: string;
    schema: PropertyType;
  }): Promise<PropertyType> {
    return this.graphApi
      .updatePropertyType({
        account_id: params.accountId,
        schema: params.schema,
      })
      .then((response) => response.data);
  }

  createEntityType(_params: {
    accountId: string;
    createdByAccountId: string;
    name: string;
    schema: Record<string, any>;
  }): Promise<EntityType> {
    throw new Error("Method not implemented.");
  }

  createEntity(params: {
    accountId: string;
    createdByAccountId: string;
    entityId?: string | undefined;
    entityVersionId?: string | undefined;
    entityTypeId?: string | undefined;
    entityTypeVersionId?: string | undefined;
    systemTypeName?: SystemType;
    versioned: boolean;
    properties: any;
  }): Promise<DbEntity> {
    throw new Error("Method not implemented.");
  }

  getEntityAccountId(params: {
    entityId: string;
    entityVersionId?: string | undefined;
  }): Promise<string> {
    throw new Error("Method not implemented.");
  }

  getEntity(
    params: { accountId: string; entityVersionId: string },
    lock?: boolean | undefined,
  ): Promise<DbEntity | undefined> {
    throw new Error("Method not implemented.");
  }

  getEntityLatestVersion(params: {
    accountId: string;
    entityId: string;
  }): Promise<DbEntity | undefined> {
    throw new Error("Method not implemented.");
  }

  getEntityType(params: {
    entityTypeVersionId: string;
  }): Promise<EntityType | null> {
    throw new Error("Method not implemented.");
  }

  getEntityTypeLatestVersion(params: {
    entityTypeId: string;
  }): Promise<EntityType | null> {
    throw new Error("Method not implemented.");
  }

  getEntityTypeByComponentId(params: {
    componentId: string;
  }): Promise<EntityType | null> {
    throw new Error("Method not implemented.");
  }

  getEntityTypeBySchema$id(params: {
    schema$id: string;
  }): Promise<EntityType | null> {
    throw new Error("Method not implemented.");
  }

  getEntityTypeChildren(params: { schemaRef: string }): Promise<EntityType[]> {
    throw new Error("Method not implemented.");
  }

  getSystemTypeLatestVersion(params: {
    systemTypeName: SystemType;
  }): Promise<EntityType> {
    throw new Error("Method not implemented.");
  }

  updateEntityType(params: {
    accountId: string;
    entityId: string;
    updatedByAccountId: string;
    entityVersionId?: string | undefined;
    schema: Record<string, any>;
  }): Promise<EntityType> {
    throw new Error("Method not implemented.");
  }

  updateEntity(params: {
    accountId: string;
    entityId: string;
    properties: any;
    updatedByAccountId: string;
  }): Promise<DbEntity> {
    throw new Error("Method not implemented.");
  }

  updateEntityAccountId(params: {
    originalAccountId: string;
    entityId: string;
    newAccountId: string;
  }): Promise<void> {
    throw new Error("Method not implemented.");
  }

  getUserByEmail(params: {
    email: string;
    verified?: boolean | undefined;
    primary?: boolean | undefined;
  }): Promise<DbEntity | null> {
    throw new Error("Method not implemented.");
  }

  getUserByShortname(params: { shortname: string }): Promise<DbEntity | null> {
    throw new Error("Method not implemented.");
  }

  getOrgByShortname(params: { shortname: string }): Promise<DbEntity | null> {
    throw new Error("Method not implemented.");
  }

  getEntitiesByType(params: {
    accountId: string;
    entityTypeId: string;
    entityTypeVersionId?: string | undefined;
    latestOnly: boolean;
  }): Promise<DbEntity[]> {
    throw new Error("Method not implemented.");
  }

  getEntitiesBySystemType(params: {
    accountId: string;
    latestOnly?: boolean | undefined;
    systemTypeName: SystemType;
  }): Promise<DbEntity[]> {
    throw new Error("Method not implemented.");
  }

  getAllAccounts(): Promise<DbEntity[]> {
    throw new Error("Method not implemented.");
  }

  accountExists(params: { accountId: string }): Promise<boolean> {
    throw new Error("Method not implemented.");
  }

  updateEntityMetadata(params: {
    accountId: string;
    entityId: string;
    extra: any;
  }): Promise<EntityMeta> {
    throw new Error("Method not implemented.");
  }

  createLink(params: {
    createdByAccountId: string;
    path: string;
    index?: number | undefined;
    sourceAccountId: string;
    sourceEntityId: string;
    sourceEntityVersionIds: Set<string>;
    destinationAccountId: string;
    destinationEntityId: string;
  }): Promise<DbLink> {
    throw new Error("Method not implemented.");
  }

  updateLink(params: {
    sourceAccountId: string;
    linkId: string;
    updatedIndex: number;
    updatedByAccountId: string;
  }): Promise<DbLink> {
    throw new Error("Method not implemented.");
  }

  getLink(params: {
    sourceAccountId: string;
    linkId: string;
  }): Promise<DbLink | null> {
    throw new Error("Method not implemented.");
  }

  deleteLink(params: {
    deletedByAccountId: string;
    sourceAccountId: string;
    linkId: string;
  }): Promise<void> {
    throw new Error("Method not implemented.");
  }

  getEntityOutgoingLinks(params: {
    accountId: string;
    entityId: string;
    activeAt?: Date | undefined;
    path?: string | undefined;
  }): Promise<DbLink[]> {
    throw new Error("Method not implemented.");
  }

  getEntityIncomingLinks(params: {
    accountId: string;
    entityId: string;
  }): Promise<DbLink[]> {
    throw new Error("Method not implemented.");
  }

  createVerificationCode(params: {
    accountId: string;
    userId: string;
    code: string;
    emailAddress: string;
  }): Promise<VerificationCode> {
    throw new Error("Method not implemented.");
  }

  createAggregation(params: {
    sourceAccountId: string;
    sourceEntityId: string;
    path: string;
    operation: object;
    createdByAccountId: string;
  }): Promise<DbAggregation> {
    throw new Error("Method not implemented.");
  }

  updateAggregationOperation(params: {
    sourceAccountId: string;
    aggregationId: string;
    updatedOperation: object;
    updatedByAccountId: string;
  }): Promise<DbAggregation> {
    throw new Error("Method not implemented.");
  }

  getAggregation(params: {
    sourceAccountId: string;
    aggregationId: string;
  }): Promise<DbAggregation | null> {
    throw new Error("Method not implemented.");
  }

  getEntityAggregationByPath(params: {
    sourceAccountId: string;
    sourceEntityId: string;
    path: string;
    activeAt?: Date | undefined;
  }): Promise<DbAggregation | null> {
    throw new Error("Method not implemented.");
  }

  getEntityAggregations(params: {
    sourceAccountId: string;
    sourceEntityId: string;
    activeAt?: Date | undefined;
  }): Promise<DbAggregation[]> {
    throw new Error("Method not implemented.");
  }

  deleteAggregation(params: {
    sourceAccountId: string;
    aggregationId: string;
    deletedByAccountId: string;
  }): Promise<void> {
    throw new Error("Method not implemented.");
  }

  getVerificationCode(params: {
    id: string;
  }): Promise<VerificationCode | null> {
    throw new Error("Method not implemented.");
  }

  getUserVerificationCodes(params: {
    userEntityId: string;
    createdAfter?: Date | undefined;
  }): Promise<VerificationCode[]> {
    throw new Error("Method not implemented.");
  }

  incrementVerificationCodeAttempts(params: {
    id: string;
    userId: string;
  }): Promise<void> {
    throw new Error("Method not implemented.");
  }

  setVerificationCodeToUsed(params: {
    id: string;
    userId: string;
  }): Promise<void> {
    throw new Error("Method not implemented.");
  }

  pruneVerificationCodes(params: { maxAgeInMs: number }): Promise<number> {
    throw new Error("Method not implemented.");
  }

  getEntityHistory(params: {
    accountId: string;
    entityId: string;
    order: "asc" | "desc";
  }): Promise<EntityVersion[]> {
    throw new Error("Method not implemented.");
  }

  getEntities(
    entities: {
      accountId: string;
      entityId: string;
      entityVersionId?: string | undefined;
    }[],
  ): Promise<DbEntity[]> {
    throw new Error("Method not implemented.");
  }

  getAccountEntities(params: {
    accountId: string;
    entityTypeFilter?:
      | {
          componentId?: string | undefined;
          entityTypeId?: string | undefined;
          entityTypeVersionId?: string | undefined;
          systemTypeName?: SystemType;
        }
      | undefined;
  }): Promise<DbEntity[]> {
    throw new Error("Method not implemented.");
  }

  getAccountEntityTypes(params: {
    accountId: string;
    includeOtherTypesInUse?: boolean | null | undefined;
  }): Promise<EntityType[]> {
    throw new Error("Method not implemented.");
  }

  acquireEntityLock(params: { entityId: string }): Promise<null> {
    throw new Error("Method not implemented.");
  }

  getImpliedEntityHistory(params: {
    accountId: string;
    entityId: string;
  }): Promise<Graph[]> {
    throw new Error("Method not implemented.");
  }

  getAncestorReferences(params: {
    accountId: string;
    entityId: string;
    depth?: number | undefined;
  }): Promise<{ accountId: string; entityId: string }[]> {
    throw new Error("Method not implemented.");
  }

  getSystemAccountId(): Promise<string> {
    throw new Error("Method not implemented.");
  }

  getChildren(params: {
    accountId: string;
    entityId: string;
    entityVersionId: string;
  }): Promise<DbEntity[]> {
    throw new Error("Method not implemented.");
  }
}

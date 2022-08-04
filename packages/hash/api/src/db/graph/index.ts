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

export class GraphClient extends DataSource implements DbClient {
  private graphApi: GraphApi;

  constructor({ basePath }: { basePath: string }, private logger: Logger) {
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

  createEntity(_params: {
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

  getEntityAccountId(_params: {
    entityId: string;
    entityVersionId?: string | undefined;
  }): Promise<string> {
    throw new Error("Method not implemented.");
  }

  getEntity(
    _params: { accountId: string; entityVersionId: string },
    _lock?: boolean | undefined,
  ): Promise<DbEntity | undefined> {
    throw new Error("Method not implemented.");
  }

  getEntityLatestVersion(_params: {
    accountId: string;
    entityId: string;
  }): Promise<DbEntity | undefined> {
    throw new Error("Method not implemented.");
  }

  getEntityType(_params: {
    entityTypeVersionId: string;
  }): Promise<EntityType | null> {
    throw new Error("Method not implemented.");
  }

  getEntityTypeLatestVersion(_params: {
    entityTypeId: string;
  }): Promise<EntityType | null> {
    throw new Error("Method not implemented.");
  }

  getEntityTypeByComponentId(_params: {
    componentId: string;
  }): Promise<EntityType | null> {
    throw new Error("Method not implemented.");
  }

  getEntityTypeBySchema$id(_params: {
    schema$id: string;
  }): Promise<EntityType | null> {
    throw new Error("Method not implemented.");
  }

  getEntityTypeChildren(_params: { schemaRef: string }): Promise<EntityType[]> {
    throw new Error("Method not implemented.");
  }

  getSystemTypeLatestVersion(_params: {
    systemTypeName: SystemType;
  }): Promise<EntityType> {
    throw new Error("Method not implemented.");
  }

  updateEntityType(_params: {
    accountId: string;
    entityId: string;
    updatedByAccountId: string;
    entityVersionId?: string | undefined;
    schema: Record<string, any>;
  }): Promise<EntityType> {
    throw new Error("Method not implemented.");
  }

  updateEntity(_params: {
    accountId: string;
    entityId: string;
    properties: any;
    updatedByAccountId: string;
  }): Promise<DbEntity> {
    throw new Error("Method not implemented.");
  }

  updateEntityAccountId(_params: {
    originalAccountId: string;
    entityId: string;
    newAccountId: string;
  }): Promise<void> {
    throw new Error("Method not implemented.");
  }

  getUserByEmail(_params: {
    email: string;
    verified?: boolean | undefined;
    primary?: boolean | undefined;
  }): Promise<DbEntity | null> {
    throw new Error("Method not implemented.");
  }

  getUserByShortname(_params: { shortname: string }): Promise<DbEntity | null> {
    throw new Error("Method not implemented.");
  }

  getOrgByShortname(_params: { shortname: string }): Promise<DbEntity | null> {
    throw new Error("Method not implemented.");
  }

  getEntitiesByType(_params: {
    accountId: string;
    entityTypeId: string;
    entityTypeVersionId?: string | undefined;
    latestOnly: boolean;
  }): Promise<DbEntity[]> {
    throw new Error("Method not implemented.");
  }

  getEntitiesBySystemType(_params: {
    accountId: string;
    latestOnly?: boolean | undefined;
    systemTypeName: SystemType;
  }): Promise<DbEntity[]> {
    throw new Error("Method not implemented.");
  }

  getAllAccounts(): Promise<DbEntity[]> {
    throw new Error("Method not implemented.");
  }

  accountExists(_params: { accountId: string }): Promise<boolean> {
    throw new Error("Method not implemented.");
  }

  updateEntityMetadata(_params: {
    accountId: string;
    entityId: string;
    extra: any;
  }): Promise<EntityMeta> {
    throw new Error("Method not implemented.");
  }

  createLink(_params: {
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

  updateLink(_params: {
    sourceAccountId: string;
    linkId: string;
    updatedIndex: number;
    updatedByAccountId: string;
  }): Promise<DbLink> {
    throw new Error("Method not implemented.");
  }

  getLink(_params: {
    sourceAccountId: string;
    linkId: string;
  }): Promise<DbLink | null> {
    throw new Error("Method not implemented.");
  }

  deleteLink(_params: {
    deletedByAccountId: string;
    sourceAccountId: string;
    linkId: string;
  }): Promise<void> {
    throw new Error("Method not implemented.");
  }

  getEntityOutgoingLinks(_params: {
    accountId: string;
    entityId: string;
    activeAt?: Date | undefined;
    path?: string | undefined;
  }): Promise<DbLink[]> {
    throw new Error("Method not implemented.");
  }

  getEntityIncomingLinks(_params: {
    accountId: string;
    entityId: string;
  }): Promise<DbLink[]> {
    throw new Error("Method not implemented.");
  }

  createVerificationCode(_params: {
    accountId: string;
    userId: string;
    code: string;
    emailAddress: string;
  }): Promise<VerificationCode> {
    throw new Error("Method not implemented.");
  }

  createAggregation(_params: {
    sourceAccountId: string;
    sourceEntityId: string;
    path: string;
    operation: object;
    createdByAccountId: string;
  }): Promise<DbAggregation> {
    throw new Error("Method not implemented.");
  }

  updateAggregationOperation(_params: {
    sourceAccountId: string;
    aggregationId: string;
    updatedOperation: object;
    updatedByAccountId: string;
  }): Promise<DbAggregation> {
    throw new Error("Method not implemented.");
  }

  getAggregation(_params: {
    sourceAccountId: string;
    aggregationId: string;
  }): Promise<DbAggregation | null> {
    throw new Error("Method not implemented.");
  }

  getEntityAggregationByPath(_params: {
    sourceAccountId: string;
    sourceEntityId: string;
    path: string;
    activeAt?: Date | undefined;
  }): Promise<DbAggregation | null> {
    throw new Error("Method not implemented.");
  }

  getEntityAggregations(_params: {
    sourceAccountId: string;
    sourceEntityId: string;
    activeAt?: Date | undefined;
  }): Promise<DbAggregation[]> {
    throw new Error("Method not implemented.");
  }

  deleteAggregation(_params: {
    sourceAccountId: string;
    aggregationId: string;
    deletedByAccountId: string;
  }): Promise<void> {
    throw new Error("Method not implemented.");
  }

  getVerificationCode(_params: {
    id: string;
  }): Promise<VerificationCode | null> {
    throw new Error("Method not implemented.");
  }

  getUserVerificationCodes(_params: {
    userEntityId: string;
    createdAfter?: Date | undefined;
  }): Promise<VerificationCode[]> {
    throw new Error("Method not implemented.");
  }

  incrementVerificationCodeAttempts(_params: {
    id: string;
    userId: string;
  }): Promise<void> {
    throw new Error("Method not implemented.");
  }

  setVerificationCodeToUsed(_params: {
    id: string;
    userId: string;
  }): Promise<void> {
    throw new Error("Method not implemented.");
  }

  pruneVerificationCodes(_params: { maxAgeInMs: number }): Promise<number> {
    throw new Error("Method not implemented.");
  }

  getEntityHistory(_params: {
    accountId: string;
    entityId: string;
    order: "asc" | "desc";
  }): Promise<EntityVersion[]> {
    throw new Error("Method not implemented.");
  }

  getEntities(
    _entities: {
      accountId: string;
      entityId: string;
      entityVersionId?: string | undefined;
    }[],
  ): Promise<DbEntity[]> {
    throw new Error("Method not implemented.");
  }

  getAccountEntities(_params: {
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

  getAccountEntityTypes(_params: {
    accountId: string;
    includeOtherTypesInUse?: boolean | null | undefined;
  }): Promise<EntityType[]> {
    throw new Error("Method not implemented.");
  }

  acquireEntityLock(_params: { entityId: string }): Promise<null> {
    throw new Error("Method not implemented.");
  }

  getImpliedEntityHistory(_params: {
    accountId: string;
    entityId: string;
  }): Promise<Graph[]> {
    throw new Error("Method not implemented.");
  }

  getAncestorReferences(_params: {
    accountId: string;
    entityId: string;
    depth?: number | undefined;
  }): Promise<{ accountId: string; entityId: string }[]> {
    throw new Error("Method not implemented.");
  }

  getSystemAccountId(): Promise<string> {
    throw new Error("Method not implemented.");
  }

  getChildren(_params: {
    accountId: string;
    entityId: string;
    entityVersionId: string;
  }): Promise<DbEntity[]> {
    throw new Error("Method not implemented.");
  }
}

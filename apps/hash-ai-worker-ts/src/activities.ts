import {
  createGraphClient,
  ImpureGraphContext,
} from "@apps/hash-api/src/graph";
import { getDataTypeSubgraphById } from "@apps/hash-api/src/graph/ontology/primitive/data-type";
import { getEntityTypeSubgraphById } from "@apps/hash-api/src/graph/ontology/primitive/entity-type";
import { getPropertyTypeSubgraphById } from "@apps/hash-api/src/graph/ontology/primitive/property-type";
import { StorageType } from "@apps/hash-api/src/storage";
import { VersionedUrl } from "@blockprotocol/type-system";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { Logger } from "@local/hash-backend-utils/logger";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  AccountId,
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";

export const createImpureGraphContext = (): ImpureGraphContext => {
  const logger = new Logger({
    mode: "dev",
    level: "debug",
    serviceName: "temporal-worker",
  });

  const graphApiHost = getRequiredEnv("HASH_GRAPH_API_HOST");
  const graphApiPort = parseInt(getRequiredEnv("HASH_GRAPH_API_PORT"), 10);

  const graphApi = createGraphClient(logger, {
    host: graphApiHost,
    port: graphApiPort,
  });

  logger.info("Created graph context");
  logger.info(JSON.stringify({ graphApi }, null, 2));

  return {
    graphApi,
    uploadProvider: {
      getFileEntityStorageKey: (_params: any) => {
        throw new Error(
          "File fetching not implemented yet for temporal worker",
        );
      },
      presignDownload: (_params: any) => {
        throw new Error(
          "File presign download not implemented yet for temporal worker.",
        );
      },
      presignUpload: (_params: any) => {
        throw new Error(
          "File presign upload not implemented yet for temporal worker.",
        );
      },
      storageType: StorageType.LocalFileSystem,
    },
  };
};

export const createGraphActivities = (createInfo: {
  graphContext: ImpureGraphContext;
}) => ({
  async getDataTypeActivity(params: {
    dataTypeId: VersionedUrl;
    actorId: AccountId;
  }): Promise<DataTypeWithMetadata> {
    const authentication = { actorId: params.actorId };
    const [dataType] = await getDataTypeSubgraphById(
      createInfo.graphContext,
      authentication,
      {
        dataTypeId: params.dataTypeId,
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: currentTimeInstantTemporalAxes,
      },
    ).then(getRoots);

    if (!dataType) {
      throw new Error(`Data type with ID ${params.dataTypeId} not found.`);
    }

    return dataType;
  },

  async getPropertyTypeActivity(params: {
    propertyTypeId: VersionedUrl;
    actorId: AccountId;
  }): Promise<PropertyTypeWithMetadata> {
    const authentication = { actorId: params.actorId };
    const [propertyType] = await getPropertyTypeSubgraphById(
      createInfo.graphContext,
      authentication,
      {
        propertyTypeId: params.propertyTypeId,
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: currentTimeInstantTemporalAxes,
      },
    ).then(getRoots);

    if (!propertyType) {
      throw new Error(
        `Property type with ID ${params.propertyTypeId} not found.`,
      );
    }

    return propertyType;
  },

  async getEntityTypeActivity(params: {
    entityTypeId: VersionedUrl;
    actorId: AccountId;
  }): Promise<EntityTypeWithMetadata> {
    const authentication = { actorId: params.actorId };
    const [entityType] = await getEntityTypeSubgraphById(
      createInfo.graphContext,
      authentication,
      {
        entityTypeId: params.entityTypeId,
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: currentTimeInstantTemporalAxes,
      },
    ).then(getRoots);

    if (!entityType) {
      throw new Error(`Entity type with ID ${params.entityTypeId} not found.`);
    }

    return entityType;
  },
});

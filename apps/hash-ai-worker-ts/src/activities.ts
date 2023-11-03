import {
  createGraphClient,
  ImpureGraphContext,
} from "@apps/hash-api/src/graph";
import { getDataTypeSubgraphById } from "@apps/hash-api/src/graph/ontology/primitive/data-type";
import { getEntityTypeSubgraphById } from "@apps/hash-api/src/graph/ontology/primitive/entity-type";
import { getPropertyTypeSubgraphById } from "@apps/hash-api/src/graph/ontology/primitive/property-type";
import { AuthenticationContext } from "@apps/hash-api/src/graphql/context";
import { VersionedUrl } from "@blockprotocol/type-system";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { Logger } from "@local/hash-backend-utils/logger";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { Status, StatusCode } from "@local/status";

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
  };
};

const valueToStatus = <T extends object>(
  value: T | undefined,
  id: string,
): Status<T> => {
  if (!value) {
    return {
      code: StatusCode.NotFound,
      message: `Type with ID ${id} not found.`,
      contents: [],
    };
  }

  return {
    code: StatusCode.Ok,
    message: "Success",
    contents: [value],
  };
};

const errorToStatus = <T extends object>(error: any): Status<T> => {
  let message = "unknown";
  if (typeof error === "string") {
    message = error;
  } else if (error instanceof Error) {
    message = error.message;
  }

  return {
    code: StatusCode.Unknown,
    message,
    contents: [],
  };
};

export const createGraphActivities = (createInfo: {
  graphContext: ImpureGraphContext;
}) => ({
  async getDataTypeActivity(params: {
    authentication: AuthenticationContext;
    dataTypeId: VersionedUrl;
  }): Promise<Status<DataTypeWithMetadata>> {
    try {
      const [dataType] = await getDataTypeSubgraphById(
        createInfo.graphContext,
        params.authentication,
        {
          dataTypeId: params.dataTypeId,
          graphResolveDepths: zeroedGraphResolveDepths,
          temporalAxes: currentTimeInstantTemporalAxes,
        },
      ).then(getRoots);

      return valueToStatus(dataType, params.dataTypeId);
    } catch (error) {
      return errorToStatus(error);
    }
  },

  async getPropertyTypeActivity(params: {
    authentication: AuthenticationContext;
    propertyTypeId: VersionedUrl;
  }): Promise<Status<PropertyTypeWithMetadata>> {
    try {
      const [propertyType] = await getPropertyTypeSubgraphById(
        createInfo.graphContext,
        params.authentication,
        {
          propertyTypeId: params.propertyTypeId,
          graphResolveDepths: zeroedGraphResolveDepths,
          temporalAxes: currentTimeInstantTemporalAxes,
        },
      ).then(getRoots);

      return valueToStatus(propertyType, params.propertyTypeId);
    } catch (error) {
      return errorToStatus(error);
    }
  },

  async getEntityTypeActivity(params: {
    authentication: AuthenticationContext;
    entityTypeId: VersionedUrl;
  }): Promise<Status<EntityTypeWithMetadata>> {
    try {
      const [entityType] = await getEntityTypeSubgraphById(
        createInfo.graphContext,
        params.authentication,
        {
          entityTypeId: params.entityTypeId,
          graphResolveDepths: zeroedGraphResolveDepths,
          temporalAxes: currentTimeInstantTemporalAxes,
        },
      ).then(getRoots);

      return valueToStatus(entityType, params.entityTypeId);
    } catch (error) {
      return errorToStatus(error);
    }
  },
});

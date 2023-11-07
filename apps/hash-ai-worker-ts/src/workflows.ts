import { AuthenticationContext } from "@apps/hash-api/src/graphql/authentication-context";
import { VersionedUrl } from "@blockprotocol/type-system";
import {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";
import { Status } from "@local/status";
import { proxyActivities } from "@temporalio/workflow";

import { createGraphActivities } from "./activities";

export const {
  getDataTypeActivity,
  getPropertyTypeActivity,
  getEntityTypeActivity,
} = proxyActivities<ReturnType<typeof createGraphActivities>>({
  startToCloseTimeout: "180 second",
  retry: {
    maximumAttempts: 3,
  },
});

// Simple workflow to test worker functionality
export const HelloWorld = async (): Promise<string> =>
  Promise.resolve("Hello Temporal!");

export const getDataType = async (params: {
  authentication: AuthenticationContext;
  dataTypeId: VersionedUrl;
}): Promise<Status<DataTypeWithMetadata>> => await getDataTypeActivity(params);
export const getPropertyType = async (params: {
  authentication: AuthenticationContext;
  propertyTypeId: VersionedUrl;
}): Promise<Status<PropertyTypeWithMetadata>> =>
  await getPropertyTypeActivity(params);
export const getEntityType = async (params: {
  authentication: AuthenticationContext;
  entityTypeId: VersionedUrl;
}): Promise<Status<EntityTypeWithMetadata>> =>
  await getEntityTypeActivity(params);

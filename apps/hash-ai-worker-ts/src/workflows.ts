import { VersionedUrl } from "@blockprotocol/type-system";
import {
  AccountId,
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";
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
  dataTypeId: VersionedUrl;
  actorId: AccountId;
}): Promise<DataTypeWithMetadata> => await getDataTypeActivity(params);
export const getPropertyType = async (params: {
  propertyTypeId: VersionedUrl;
  actorId: AccountId;
}): Promise<PropertyTypeWithMetadata> => await getPropertyTypeActivity(params);
export const getEntityType = async (params: {
  entityTypeId: VersionedUrl;
  actorId: AccountId;
}): Promise<EntityTypeWithMetadata> => await getEntityTypeActivity(params);

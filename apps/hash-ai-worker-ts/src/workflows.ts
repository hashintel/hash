import { VersionedUrl } from "@blockprotocol/type-system";
import {
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

export const getDataType = async (params: {
  dataTypeId: VersionedUrl;
}): Promise<DataTypeWithMetadata> => await getDataTypeActivity(params);
export const getPropertyType = async (params: {
  propertyTypeId: VersionedUrl;
}): Promise<PropertyTypeWithMetadata> => await getPropertyTypeActivity(params);
export const getEntityType = async (params: {
  entityTypeId: VersionedUrl;
}): Promise<EntityTypeWithMetadata> => await getEntityTypeActivity(params);

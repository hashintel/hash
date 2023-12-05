import { VersionedUrl } from "@blockprotocol/type-system";

import {
  CACHED_DATA_TYPE_SCHEMAS,
  CACHED_ENTITY_TYPE_SCHEMAS,
  CACHED_PROPERTY_TYPE_SCHEMAS,
} from "../../../seed-data";
import { MigrationFunction } from "../types";
import {
  loadExternalDataTypeIfNotExists,
  loadExternalEntityTypeIfNotExists,
  loadExternalPropertyTypeIfNotExists,
} from "../util";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  let blockProtocolDataTypeId: VersionedUrl;
  // eslint-disable-next-line guard-for-in
  for (blockProtocolDataTypeId in CACHED_DATA_TYPE_SCHEMAS) {
    await loadExternalDataTypeIfNotExists(context, authentication, {
      dataTypeId: blockProtocolDataTypeId,
      migrationState,
    });
  }

  let blockProtocolPropertyTypeId: VersionedUrl;
  // eslint-disable-next-line guard-for-in
  for (blockProtocolPropertyTypeId in CACHED_PROPERTY_TYPE_SCHEMAS) {
    await loadExternalPropertyTypeIfNotExists(context, authentication, {
      propertyTypeId: blockProtocolPropertyTypeId,
      migrationState,
    });
  }

  let blockProtocolEntityTypeId: VersionedUrl;
  // eslint-disable-next-line guard-for-in
  for (blockProtocolEntityTypeId in CACHED_ENTITY_TYPE_SCHEMAS) {
    await loadExternalEntityTypeIfNotExists(context, authentication, {
      entityTypeId: blockProtocolEntityTypeId,
      migrationState,
    });
  }

  return migrationState;
};

export default migrate;

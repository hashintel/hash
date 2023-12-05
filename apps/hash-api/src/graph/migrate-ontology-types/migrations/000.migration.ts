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
import { VersionedUrl } from "@blockprotocol/type-system";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  let blockProtocolDataTypeId: VersionedUrl;
  for (blockProtocolDataTypeId in CACHED_DATA_TYPE_SCHEMAS) {
    /** @todo: provide schemas so they don't have to be fetched from blockprotocol.org */
    await loadExternalDataTypeIfNotExists(context, authentication, {
      dataTypeId: blockProtocolDataTypeId,
      migrationState,
    });
  }

  let blockProtocolPropertyTypeId: VersionedUrl;
  for (blockProtocolPropertyTypeId in CACHED_PROPERTY_TYPE_SCHEMAS) {
    /** @todo: provide schemas so they don't have to be fetched from blockprotocol.org */
    await loadExternalPropertyTypeIfNotExists(context, authentication, {
      propertyTypeId: blockProtocolPropertyTypeId,
      migrationState,
    });
  }

  let blockProtocolEntityTypeId: VersionedUrl;
  for (blockProtocolEntityTypeId in CACHED_ENTITY_TYPE_SCHEMAS) {
    /** @todo: provide schemas so they don't have to be fetched from blockprotocol.org */
    await loadExternalEntityTypeIfNotExists(context, authentication, {
      entityTypeId: blockProtocolEntityTypeId,
      migrationState,
    });
  }

  return migrationState;
};

export default migrate;

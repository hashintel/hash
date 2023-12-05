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
  for (const blockProtocolDataTypeId of Object.keys(CACHED_DATA_TYPE_SCHEMAS)) {
    /** @todo: provide schemas so they don't have to be fetched from blockprotocol.org */
    await loadExternalDataTypeIfNotExists(context, authentication, {
      dataTypeId: blockProtocolDataTypeId,
      migrationState,
    });
  }

  for (const blockProtocolPropertyTypeId of Object.keys(
    CACHED_PROPERTY_TYPE_SCHEMAS,
  )) {
    /** @todo: provide schemas so they don't have to be fetched from blockprotocol.org */
    await loadExternalPropertyTypeIfNotExists(context, authentication, {
      propertyTypeId: blockProtocolPropertyTypeId,
      migrationState,
    });
  }

  for (const blockProtocolEntityTypeId of Object.keys(
    CACHED_ENTITY_TYPE_SCHEMAS,
  )) {
    /** @todo: provide schemas so they don't have to be fetched from blockprotocol.org */
    await loadExternalEntityTypeIfNotExists(context, authentication, {
      entityTypeId: blockProtocolEntityTypeId,
      migrationState,
    });
  }

  return migrationState;
};

export default migrate;

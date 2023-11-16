import { MigrationFunction } from "../types";
import { loadExternalEntityTypeIfNotExists } from "../util";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  await loadExternalEntityTypeIfNotExists(context, authentication, {
    entityTypeId: "https://blockprotocol.org/@hash/types/entity-type/query/v/1",
    migrationState,
  });

  await loadExternalEntityTypeIfNotExists(context, authentication, {
    entityTypeId:
      "https://blockprotocol.org/@hash/types/entity-type/has-query/v/1",
    migrationState,
  });

  return migrationState;
};

export default migrate;

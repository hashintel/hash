import { VersionedUrl } from "@blockprotocol/type-system";

import { MigrationFunction } from "../types";
import { loadExternalDataTypeIfNotExists } from "../util";

const blockProtocolDataTypeIds: VersionedUrl[] = [
  "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
  "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
  "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1",
  "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
  "https://blockprotocol.org/@blockprotocol/types/data-type/empty-list/v/1",
  "https://blockprotocol.org/@blockprotocol/types/data-type/null/v/1",
];

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  for (const blockProtocolDataTypeId of blockProtocolDataTypeIds) {
    /** @todo: provide schemas so they don't have to be fetched from blockprotocol.org */
    await loadExternalDataTypeIfNotExists(context, authentication, {
      dataTypeId: blockProtocolDataTypeId,
      migrationState,
    });
  }

  return migrationState;
};

export default migrate;

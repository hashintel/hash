import {
  componentsFromVersionedUrl,
  versionedUrlFromComponents,
} from "@blockprotocol/type-system";

import { createSystemPropertyTypeIfNotExists } from "../util";
import { isoDataTypes } from "./036-add-iso-quantity-types/data-types";
import { isoPropertyTypes } from "./036-add-iso-quantity-types/property-types";
import { ensureUnitDataType } from "./shared/ensure-unit-data-type";

import type { MigrationFunction } from "../types";
import type { VersionedUrl } from "@blockprotocol/type-system";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  const currentDataTypeId = (id: VersionedUrl): VersionedUrl => {
    const { baseUrl, version } = componentsFromVersionedUrl(id);
    const currentVersion = migrationState.dataTypeVersions[baseUrl];
    if (!currentVersion && baseUrl.startsWith("https://hash.ai/@h/")) {
      throw new Error(`Data type '${baseUrl}' has not been seeded`);
    }
    return versionedUrlFromComponents(baseUrl, currentVersion ?? version);
  };

  for (const { definition, conversions } of isoDataTypes) {
    await ensureUnitDataType(context, authentication, {
      dataTypeDefinition: {
        ...definition,
        allOf: definition.allOf?.map(({ $ref }) => ({
          $ref: currentDataTypeId($ref),
        })),
      },
      conversions,
      migrationState,
      webShortname: "h",
    });
  }

  for (const { definition } of isoPropertyTypes) {
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        ...definition,
        possibleValues: definition.possibleValues.map((value) => ({
          ...value,
          ...(value.dataTypeId
            ? { dataTypeId: currentDataTypeId(value.dataTypeId) }
            : {}),
        })),
      },
      migrationState,
      webShortname: "h",
    });
  }

  return migrationState;
};

export default migrate;

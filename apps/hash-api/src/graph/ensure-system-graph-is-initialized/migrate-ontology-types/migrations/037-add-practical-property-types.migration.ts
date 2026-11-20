import {
  componentsFromVersionedUrl,
  versionedUrlFromComponents,
} from "@blockprotocol/type-system";

import { createSystemPropertyTypeIfNotExists } from "../util";
import { measurementDataTypes } from "./037-add-practical-property-types/data-types";
import { measurementPropertyTypes } from "./037-add-practical-property-types/property-types";
import { ensureUnitDataType } from "./shared/ensure-unit-data-type";

import type { MigrationFunction } from "../types";
import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  const currentDataTypeId = (id: VersionedUrl): VersionedUrl => {
    const { baseUrl, version } = componentsFromVersionedUrl(id);
    const currentVersion = migrationState.dataTypeVersions[baseUrl];
    if (!currentVersion && baseUrl.startsWith("https://hash.ai/")) {
      throw new Error(`Data type '${baseUrl}' has not been seeded`);
    }
    return versionedUrlFromComponents(baseUrl, currentVersion ?? version);
  };

  for (const {
    dataTypeBaseUrl,
    definition,
    conversions,
  } of measurementDataTypes) {
    for (const target of Object.keys(conversions) as BaseUrl[]) {
      if (!migrationState.dataTypeVersions[target]) {
        throw new Error(`Conversion target '${target}' has not been seeded`);
      }
    }
    await ensureUnitDataType(context, authentication, {
      dataTypeDefinition: {
        ...definition,
        allOf: definition.allOf?.map(({ $ref }) => ({
          $ref: currentDataTypeId($ref),
        })),
      },
      dataTypeBaseUrl,
      conversions,
      migrationState,
      webShortname: "h",
    });
  }

  for (const definition of measurementPropertyTypes) {
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        ...definition,
        possibleValues: [
          {
            dataTypeId: currentDataTypeId(
              definition.possibleValues[0].dataTypeId,
            ),
          },
        ],
      },
      migrationState,
      webShortname: "h",
    });
  }
  return migrationState;
};

export default migrate;

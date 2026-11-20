import {
  componentsFromVersionedUrl,
  versionedUrlFromComponents,
} from "@blockprotocol/type-system";

import { createSystemPropertyTypeIfNotExists } from "../util";
import { measurementPropertyTypes } from "./037-add-practical-property-types/property-types";

import type { MigrationFunction } from "../types";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  for (const definition of measurementPropertyTypes) {
    const { baseUrl } = componentsFromVersionedUrl(
      definition.possibleValues[0].dataTypeId,
    );
    const version = migrationState.dataTypeVersions[baseUrl];
    if (!version) {
      throw new Error(`Data type '${baseUrl}' has not been seeded`);
    }
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        ...definition,
        possibleValues: [
          { dataTypeId: versionedUrlFromComponents(baseUrl, version) },
        ],
      },
      migrationState,
      webShortname: "h",
    });
  }
  return migrationState;
};

export default migrate;

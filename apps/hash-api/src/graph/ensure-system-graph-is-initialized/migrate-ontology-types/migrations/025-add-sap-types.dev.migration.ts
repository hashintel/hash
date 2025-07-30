import {
  blockProtocolDataTypes,
  blockProtocolEntityTypes,
  systemDataTypes,
  systemEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { MigrationFunction } from "../types";
import {
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
} from "../util";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  const xPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "X",
        description: "X",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const xLinkType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "X",
        description: "X",
        properties: [],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const xEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Invitation",
        description: "A request or offer to join or attend something.",
        properties: [
          {
            propertyType: xPropertyType.schema.$id,
            required: true,
          },
        ],
        outgoingLinks: [
          {
            linkEntityType: xLinkType.schema.$id,
            destinationEntityTypes: [
              systemEntityTypes.organization.entityTypeId,
            ],
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  return migrationState;
};

export default migrate;

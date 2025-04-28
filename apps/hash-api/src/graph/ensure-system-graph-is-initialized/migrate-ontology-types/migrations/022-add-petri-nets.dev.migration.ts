import { blockProtocolEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { MigrationFunction } from "../types";
import {
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
  getCurrentHashPropertyTypeId,
} from "../util";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  const netDefinitionPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Definition Object",
        description:
          "A definition of something, represented as an opaque JSON object.",
        possibleValues: [{ primitiveDataType: "object" }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const titlePropertyTypeId = getCurrentHashPropertyTypeId({
    propertyTypeKey: "title",
    migrationState,
  });

  const transitionIdPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Transition ID",
        description: "An identifier for a transition.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const subProcessOfLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Sub Process Of",
        inverse: {
          title: "Parent Process Of",
        },
        description: "A process which contains this process.",
        properties: [
          {
            propertyType: transitionIdPropertyType,
            required: true,
          },
        ],
      },
      migrationState,
      webShortname: "h",
      instantiator: null,
    },
  );

  const _petriNetEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Petri Net",
        description:
          "A Petri net is a mathematical model of a system that can be used to represent and analyze complex systems.",
        properties: [
          {
            propertyType: netDefinitionPropertyType.schema.$id,
            required: true,
          },
          {
            propertyType: titlePropertyTypeId,
            required: true,
          },
        ],
        outgoingLinks: [
          {
            linkEntityType: subProcessOfLinkEntityType,
            destinationEntityTypes: ["SELF_REFERENCE"],
          },
        ],
      },
      migrationState,
      webShortname: "h",
      instantiator: null,
    },
  );

  return migrationState;
};

export default migrate;

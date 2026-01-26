import { blockProtocolPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { MigrationFunction } from "../types";
import {
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
  getCurrentHashLinkEntityTypeId,
} from "../util";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  // ============================================
  // Property Types
  // ============================================

  const gridLayoutPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Grid Layout",
        description: "Configuration for laying objects out on a grid.",
        possibleValues: [{ primitiveDataType: "object" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const goalPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Goal",
        description:
          "A natural language description of the objective of something.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const structuralQueryPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Structural Query",
        description: "A HASH Graph API structural query.",
        possibleValues: [{ primitiveDataType: "object" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const pythonScriptPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Python Script",
        description: "A script written in the Python programming language.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const chartConfigPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Chart Configuration",
        description: "Configuration options for rendering a chart.",
        possibleValues: [{ primitiveDataType: "object" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const chartTypePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Chart Type",
        description: "A type of data visualization chart.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  /** @todo consider a typed object here */
  const gridPositionPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Grid Position",
        description:
          "The position and dimensions of an item within a grid layout.",
        possibleValues: [{ primitiveDataType: "object" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  /** @todo consider an enum here */
  const configurationStatusPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Configuration Status",
        description: "The status of a configuration process.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    });

  // ============================================
  // Entity Types
  // ============================================

  const dashboardItemEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Dashboard Item",
        titlePlural: "Dashboard Items",
        icon: "/icons/types/chart-mixed.svg",
        description: "A visualization item within a dashboard.",
        properties: [
          {
            propertyType: blockProtocolPropertyTypes.name.propertyTypeId,
            required: true,
          },
          {
            propertyType: blockProtocolPropertyTypes.description.propertyTypeId,
            required: false,
          },
          {
            propertyType: goalPropertyType,
            required: true,
          },
          {
            propertyType: structuralQueryPropertyType,
            required: false,
          },
          {
            propertyType: pythonScriptPropertyType,
            required: false,
          },
          {
            propertyType: chartConfigPropertyType,
            required: false,
          },
          {
            propertyType: chartTypePropertyType,
            required: false,
          },
          {
            propertyType: gridPositionPropertyType,
            required: true,
          },
          {
            propertyType: configurationStatusPropertyType,
            required: true,
          },
        ],
        outgoingLinks: [],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const hasLinkType = getCurrentHashLinkEntityTypeId({
    linkEntityTypeKey: "has",
    migrationState,
  });

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      title: "Dashboard",
      titlePlural: "Dashboards",
      icon: "/icons/types/objects-column.svg",
      description:
        "A customizable dashboard containing multiple visualization items arranged in a grid layout.",
      properties: [
        {
          propertyType: blockProtocolPropertyTypes.name.propertyTypeId,
          required: true,
        },
        {
          propertyType: blockProtocolPropertyTypes.description.propertyTypeId,
          required: false,
        },
        {
          propertyType: gridLayoutPropertyType,
          required: false,
        },
      ],
      outgoingLinks: [
        {
          linkEntityType: hasLinkType,
          destinationEntityTypes: [dashboardItemEntityType],
          minItems: 0,
        },
      ],
    },
    webShortname: "h",
    migrationState,
  });

  return migrationState;
};

export default migrate;

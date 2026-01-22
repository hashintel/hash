/**
 * This file was automatically generated – do not edit it.
 */

import type { ObjectMetadata } from "@blockprotocol/type-system";

import type {
  ChartConfigurationPropertyValue,
  ChartConfigurationPropertyValueWithMetadata,
  ChartTypePropertyValue,
  ChartTypePropertyValueWithMetadata,
  ConfigurationStatusPropertyValue,
  ConfigurationStatusPropertyValueWithMetadata,
  DashboardItem,
  DashboardItemOutgoingLinkAndTarget,
  DashboardItemOutgoingLinksByLinkEntityTypeId,
  DashboardItemProperties,
  DashboardItemPropertiesWithMetadata,
  DescriptionPropertyValue,
  DescriptionPropertyValueWithMetadata,
  GoalPropertyValue,
  GoalPropertyValueWithMetadata,
  GridPositionPropertyValue,
  GridPositionPropertyValueWithMetadata,
  Has,
  HasOutgoingLinkAndTarget,
  HasOutgoingLinksByLinkEntityTypeId,
  HasProperties,
  HasPropertiesWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  NamePropertyValue,
  NamePropertyValueWithMetadata,
  ObjectDataType,
  ObjectDataTypeWithMetadata,
  PythonScriptPropertyValue,
  PythonScriptPropertyValueWithMetadata,
  StructuralQueryPropertyValue,
  StructuralQueryPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
} from "./shared.js";

export type {
  ChartConfigurationPropertyValue,
  ChartConfigurationPropertyValueWithMetadata,
  ChartTypePropertyValue,
  ChartTypePropertyValueWithMetadata,
  ConfigurationStatusPropertyValue,
  ConfigurationStatusPropertyValueWithMetadata,
  DashboardItem,
  DashboardItemOutgoingLinkAndTarget,
  DashboardItemOutgoingLinksByLinkEntityTypeId,
  DashboardItemProperties,
  DashboardItemPropertiesWithMetadata,
  DescriptionPropertyValue,
  DescriptionPropertyValueWithMetadata,
  GoalPropertyValue,
  GoalPropertyValueWithMetadata,
  GridPositionPropertyValue,
  GridPositionPropertyValueWithMetadata,
  Has,
  HasOutgoingLinkAndTarget,
  HasOutgoingLinksByLinkEntityTypeId,
  HasProperties,
  HasPropertiesWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  NamePropertyValue,
  NamePropertyValueWithMetadata,
  ObjectDataType,
  ObjectDataTypeWithMetadata,
  PythonScriptPropertyValue,
  PythonScriptPropertyValueWithMetadata,
  StructuralQueryPropertyValue,
  StructuralQueryPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
};

/**
 * A customizable dashboard containing multiple visualization items arranged in a grid layout.
 */
export type Dashboard = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/dashboard/v/1"];
  properties: DashboardProperties;
  propertiesWithMetadata: DashboardPropertiesWithMetadata;
};

export type DashboardHasLink = { linkEntity: Has; rightEntity: DashboardItem };

export type DashboardOutgoingLinkAndTarget = DashboardHasLink;

export type DashboardOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@h/types/entity-type/has/v/1": DashboardHasLink;
};

/**
 * A customizable dashboard containing multiple visualization items arranged in a grid layout.
 */
export type DashboardProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValue;
  "https://hash.ai/@h/types/property-type/grid-layout/"?: GridLayoutPropertyValue;
};

export type DashboardPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValueWithMetadata;
    "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/grid-layout/"?: GridLayoutPropertyValueWithMetadata;
  };
};

/**
 * Configuration for laying objects out on a grid.
 */
export type GridLayoutPropertyValue = ObjectDataType;

export type GridLayoutPropertyValueWithMetadata = ObjectDataTypeWithMetadata;

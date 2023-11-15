import { VersionedUrl } from "@blockprotocol/graph/.";

export type BarChartDefinitionVariant = {
  variant: "group-by-property";
  entityTypeId: VersionedUrl;
  groupByPropertyTypeId: VersionedUrl;
};

export type ChartDefinitions = {
  "bar-chart": BarChartDefinitionVariant;
};

export type ChartDefinitionKinds = keyof ChartDefinitions;

export type ChartDefinition<
  Kind extends ChartDefinitionKinds = ChartDefinitionKinds,
> = {
  kind: Kind;
} & ChartDefinitions[Kind];

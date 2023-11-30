import { VersionedUrl } from "@blockprotocol/graph";

export type BarChartDefinitionVariant = {
  variant: "group-by-property";
  entityTypeId: VersionedUrl;
  groupByPropertyTypeId: VersionedUrl;
  xAxisLabel?: string;
  yAxisLabel?: string;
};

export type ChartDefinitions = {
  "bar-chart": BarChartDefinitionVariant;
  "graph-chart": {};
};

export type ChartDefinitionKinds = keyof ChartDefinitions;

export type ChartDefinition<
  Kind extends ChartDefinitionKinds = ChartDefinitionKinds,
> = {
  kind: Kind;
} & ChartDefinitions[Kind];

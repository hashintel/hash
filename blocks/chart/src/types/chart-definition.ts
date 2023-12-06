import { VersionedUrl } from "@blockprotocol/graph";

export type BarChartDefinitionVariant = {
  variant: "group-by-property";
  entityTypeId: VersionedUrl;
  groupByPropertyTypeId: VersionedUrl;
  xAxisLabel?: string;
  yAxisLabel?: string;
};

export type GraphChartDefinitionVariant = {
  incomingLinksDepth?: number;
  outgoingLinksDepth?: number;
};

export type ChartDefinitions = {
  "bar-chart": BarChartDefinitionVariant;
  "graph-chart": GraphChartDefinitionVariant;
};

export type ChartDefinitionKinds = keyof ChartDefinitions;

export type ChartDefinition<
  Kind extends ChartDefinitionKinds = ChartDefinitionKinds,
> = {
  kind: Kind;
} & ChartDefinitions[Kind];

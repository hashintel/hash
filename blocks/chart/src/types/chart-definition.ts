import type { VersionedUrl } from "@blockprotocol/graph";

export type BarChartCountLinkedEntitiesVariant = {
  variant: "count-links";
  entityTypeId: VersionedUrl;
  labelPropertyTypeId: VersionedUrl;
  direction: "incoming" | "outgoing";
  linkEntityTypeId: VersionedUrl;
  xAxisLabel?: string;
  yAxisLabel?: string;
};

export type BarChartGroupByPropertyVariant = {
  variant: "group-by-property";
  entityTypeId: VersionedUrl;
  groupByPropertyTypeId: VersionedUrl;
  xAxisLabel?: string;
  yAxisLabel?: string;
};

export type BarChartDefinitionVariant =
  | BarChartCountLinkedEntitiesVariant
  | BarChartGroupByPropertyVariant;

export type GraphChartDefinitionVariant = {
  /**
   * Without this TS can't infer between the bar chart and graph chart variants
   *
   * @todo: figure out a better approach for structuring and typing the chart definition
   */
  variant: "default";
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

import type { SelectItem } from "@hashintel/ds-components";
import type { SDCPN } from "@hashintel/petrinaut-core";

export const MODEL_METRIC_VALUE_PREFIX = "model:";
export const CUSTOM_METRIC_VALUE = "expression";

export type MetricKindGroup = {
  id: string;
  label: string;
  items: SelectItem<string>[];
};

export function createMetricKindGroups(
  sdcpn: SDCPN,
  { includeBuiltIn = true }: { includeBuiltIn?: boolean } = {},
): MetricKindGroup[] {
  const groups: MetricKindGroup[] = includeBuiltIn
    ? [
        {
          id: "built-in",
          label: "Built-in",
          items: [
            { value: "placeTokenCountMean", text: "Place tokens" },
            { value: "transitionFiringCount", text: "Transition firing" },
          ],
        },
      ]
    : [];

  const modelMetrics = sdcpn.metrics ?? [];
  if (modelMetrics.length > 0) {
    groups.push({
      id: "model",
      label: "Model metrics",
      items: modelMetrics.map((metric) => ({
        value: `${MODEL_METRIC_VALUE_PREFIX}${metric.id}`,
        text: metric.name,
      })),
    });
  }

  groups.push({
    id: "custom",
    label: "Custom",
    items: [{ value: CUSTOM_METRIC_VALUE, text: "Custom code" }],
  });

  return groups;
}

const METRIC_KIND_ICONS: Record<string, "circle" | "lightning" | "code"> = {
  placeTokenCountMean: "circle",
  transitionFiringCount: "lightning",
  [CUSTOM_METRIC_VALUE]: "code",
};

export function getMetricKindIcon(
  value: string,
): "circle" | "lightning" | "code" | "function" | undefined {
  return value.startsWith(MODEL_METRIC_VALUE_PREFIX)
    ? "function"
    : METRIC_KIND_ICONS[value];
}

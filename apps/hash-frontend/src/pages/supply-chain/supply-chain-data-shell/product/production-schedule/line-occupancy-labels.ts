export const lineSourceLabel = (source: string): string =>
  ({
    campaign_sheet: "confirmed campaign sheet",
    planning_gantt_order: "production plan order",
    planning_gantt_campaign: "production plan campaign",
    sap_order_operation: "SAP order operations",
    sap_recipe_operation: "SAP recipe operations",
    recipe_resource: "SAP recipe resources",
    standard_lot: "standard lot-size mapping",
    planning_table: "PlanningTable material mapping",
  })[source] ?? source.replaceAll("_", " ");

export const lineOccupancyTimingLabel = ({
  derivation,
  finishSource,
  startSource,
}: {
  derivation: string;
  finishSource: string;
  startSource: string;
}): string => {
  if (derivation === "confirmed") {
    return "Confirmed production dates";
  }
  if (startSource === "afko_actual" && finishSource === "afko_actual") {
    return "Actual dates from SAP production order";
  }
  if (startSource === "afko_prorated_from_receipt") {
    return "Estimated from SAP order and receipt dates";
  }
  if (derivation === "afko_order") {
    return "Dates from SAP production order";
  }
  return derivation.replaceAll("_", " ");
};

export const lineOccupancyOperationsFromReason = (
  reason: string,
): readonly string[] => {
  const match = /(?:^|;\s*)operations \[([^\]]*)\]/u.exec(reason);
  return match?.[1]
    ? match[1]
        .split(";")
        .map((operation) => operation.trim())
        .filter(Boolean)
    : [];
};

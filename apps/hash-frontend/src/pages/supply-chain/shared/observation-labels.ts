import type { StepType } from "./types";

export type CountDimension = "timing" | "yield" | "consumption" | "supplier";

interface CountContext {
  id?: string;
  label?: string;
  type: StepType;
  dimension?: CountDimension;
  selectedComponent?: boolean;
}

interface CountTooltipContext extends CountContext {
  count: number;
  rangeLabel?: string | null;
  nBatches?: number | null;
  nMovements?: number | null;
}

function isDirectShip(ctx: Pick<CountContext, "id" | "label">): boolean {
  return Boolean(
    (ctx.id?.startsWith("direct_ship_") ?? false) ||
    ctx.label?.toLowerCase().includes("direct-to-customer"),
  );
}

export function countNoun(ctx: CountContext): string {
  if (ctx.dimension === "yield") {
    return "production orders";
  }
  if (ctx.dimension === "consumption") {
    return ctx.selectedComponent ? "component events" : "consumption events";
  }
  if (ctx.dimension === "supplier") {
    return "schedule lines";
  }
  return "events";
}

export function shortCountLabel(count: number, ctx: CountContext): string {
  return `${count} ${countNoun(ctx)}`;
}

export function rangeLabel(value?: string | null): string {
  if (!value || value === "all") {
    return "all time";
  }
  if (value === "3m") {
    return "the last 3 months";
  }
  if (value === "6m") {
    return "the last 6 months";
  }
  if (value === "12m" || value === "1y") {
    return "the last 12 months";
  }
  if (value === "2y") {
    return "the last 2 years";
  }
  return value;
}

export function dateAnchorLabel(ctx: CountContext): string {
  if (ctx.dimension === "yield") {
    return "production receipt date";
  }
  if (ctx.dimension === "consumption") {
    return "consumption posting date";
  }
  if (isDirectShip(ctx)) {
    return "actual arrival date";
  }

  switch (ctx.type) {
    case "procurement":
      return "first goods receipt date";
    case "raw_material_dwell":
    case "intermediate_dwell":
      return "consumption date";
    case "production":
      return "schedule start";
    case "qa_hold":
      return "production receipt date";
    case "post_qa_ship":
      return "QA release date";
    case "transit":
      return "hub receipt date";
    case "destination_dwell":
      return "hub outbound date";
    default:
      return "event date";
  }
}

function eventMethodology(ctx: CountContext): string {
  if (ctx.dimension === "yield") {
    return "each production order contributes one receipt-ratio event.";
  }
  if (ctx.dimension === "consumption") {
    return ctx.selectedComponent
      ? "each component consumption posting contributes one variance event."
      : "component consumption postings are aggregated into consumption events.";
  }
  if (isDirectShip(ctx)) {
    return "each customer delivery contributes one direct-ship event (per delivery, per batch).";
  }

  switch (ctx.type) {
    case "procurement":
      return "each matched PO goods receipt contributes one lead-time event.";
    case "raw_material_dwell":
    case "intermediate_dwell":
      return "each consumption tranche / goods issue is counted separately.";
    case "production":
      return "each production schedule campaign contributes one duration event.";
    case "qa_hold":
      return "each finished-good batch contributes one QA-hold event.";
    case "post_qa_ship":
      return "each dispatch (customer delivery or hub transfer) contributes one post-QA dwell event.";
    case "transit":
      return "each hub arrival contributes one transit event.";
    case "destination_dwell":
      return "each hub dispatch contributes one destination-dwell event.";
    default:
      return "each source event contributes one timing event.";
  }
}

export function countTooltip(ctx: CountTooltipContext): string {
  const label = shortCountLabel(ctx.count, ctx);
  const period = rangeLabel(ctx.rangeLabel);
  const base = `${label} in ${period}. Filtered by ${dateAnchorLabel(ctx)}; ${eventMethodology(ctx)}`;
  if (ctx.nBatches != null && ctx.nMovements != null) {
    return `${base} All-time source coverage: ${ctx.nBatches} batches, ${ctx.nMovements} movements.`;
  }
  return base;
}

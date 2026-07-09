import type { StepType } from "./types";

export type CategoryIcon =
  | "puzzle"
  | "clock"
  | "blocks"
  | "search-check"
  | "truck";

export interface Category {
  key: string;
  label: string;
  color: string;
  icon: CategoryIcon;
  types: StepType[];
  hidden?: boolean;
}

export const CATEGORIES: Category[] = [
  {
    key: "dwell",
    label: "Dwell",
    color: "#989898",
    icon: "clock",
    types: [
      "raw_material_dwell",
      "intermediate_dwell",
      "post_qa_ship",
      "destination_dwell",
    ],
  },
  {
    key: "procurement",
    label: "Procurement",
    color: "#64ade6",
    icon: "puzzle",
    types: ["procurement"],
  },
  {
    key: "production",
    label: "Production",
    color: "#9797fe",
    icon: "blocks",
    types: ["production"],
  },
  {
    key: "qa",
    label: "QA",
    color: "#3cc3b3",
    icon: "search-check",
    types: ["qa_hold"],
  },
  {
    key: "logistics",
    label: "Logistics",
    color: "#ff9c5e",
    icon: "truck",
    types: ["transit"],
  },
];

/** Canonical display order for finer step types (used by the Step column filter). */
export const STEP_TYPE_ORDER: StepType[] = [
  "procurement",
  "raw_material_dwell",
  "production",
  "intermediate_dwell",
  "qa_hold",
  "post_qa_ship",
  "transit",
  "destination_dwell",
];

/** Human-readable labels for each finer step type (used by the Step column filter). */
export const STEP_TYPE_LABELS: Record<StepType, string> = {
  procurement: "Procurement",
  raw_material_dwell: "Raw material",
  production: "Production",
  intermediate_dwell: "Intermediate",
  qa_hold: "QA hold",
  post_qa_ship: "QA to Ship",
  transit: "Transit",
  destination_dwell: "Destination",
};

export const PIPELINE_COLORS: Record<string, string> = {
  procurement: "#64ade6",
  raw_material_dwell: "#989898",
  intermediate_dwell: "#989898",
  production: "#9797fe",
  qa_hold: "#3cc3b3",
  post_qa_ship: "#989898",
  transit: "#ff9c5e",
  destination_dwell: "#989898",
};

export const DWELL_TYPES: StepType[] = [
  "raw_material_dwell",
  "intermediate_dwell",
  "destination_dwell",
  "post_qa_ship",
];

export function getCategoryForType(type: StepType): Category | undefined {
  return CATEGORIES.find((category) => category.types.includes(type));
}

export function getCategoryColor(type: StepType): string {
  return PIPELINE_COLORS[type] ?? "#94a3b8";
}

export function isDwellType(type: StepType): boolean {
  return DWELL_TYPES.includes(type);
}

export function getCategoryIcon(type: StepType): CategoryIcon {
  const cat = getCategoryForType(type);
  return cat?.icon ?? "puzzle";
}

export const PRODUCTION_TYPES: StepType[] = ["production"];

export function isProductionType(type: StepType): boolean {
  return PRODUCTION_TYPES.includes(type);
}

/**
 * Step types whose `node.id` is *location*-scoped (a plant, hub, or lane)
 * rather than encoding the good/material that is the step's subject. For these,
 * the relevant finished good must be appended to any stable identity/scope key,
 * otherwise different finished goods sharing the same plant/hub/lane collide.
 *
 * Contrast with the location-agnostic steps, whose subject is already in
 * `node.id` and so need no product: procurement (`procurement_<item>`), raw &
 * intermediate dwell (`*_dwell_<material>`), and production
 * (`prod_duration_<good>`).
 *
 * The location-scoped steps are the finished-good leg from QA onward:
 * - `qa_hold` -> `prod_to_qa_pla` (plant)
 * - `post_qa_ship` -> `post_qa_ship_pla` (plant)
 * - `transit` -> `transit_pla_hub1` / `direct_ship_pla` (lane)
 * - `destination_dwell` -> `dest_dwell_hub1` (hub)
 *
 * Each of these is deduplicated per finished good, so the node always carries a
 * single product and appending it is stable (a new finished good spawns its own
 * node/key rather than rekeying existing ones).
 */
export const PRODUCT_SPECIFIC_STEP_TYPES: StepType[] = [
  "qa_hold",
  "post_qa_ship",
  "transit",
  "destination_dwell",
];

export function isProductSpecificType(type: StepType): boolean {
  return PRODUCT_SPECIFIC_STEP_TYPES.includes(type);
}

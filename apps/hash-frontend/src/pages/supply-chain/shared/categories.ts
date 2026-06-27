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
  return CATEGORIES.find((column) => column.types.includes(type));
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

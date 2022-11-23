import { SizedGridColumn } from "@glideapps/glide-data-grid";

export type LinkRow = {
  linkEntityTypeTitle: string;
  linkedWith: string;
  relationship: string;
  expectedEntityType: string;
  linkEntityTypeId: string;
};

export type LinkColumnKey = Extract<
  keyof LinkRow,
  "linkEntityTypeTitle" | "linkedWith" | "expectedEntityType" | "relationship"
>;

export interface LinkColumn extends SizedGridColumn {
  id: LinkColumnKey;
}

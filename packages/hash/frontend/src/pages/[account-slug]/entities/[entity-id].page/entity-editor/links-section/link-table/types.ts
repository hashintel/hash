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
  "type" | "linkedWith" | "expectedEntityType" | "relationShip"
>;

export interface LinkColumn extends SizedGridColumn {
  id: LinkColumnKey;
}

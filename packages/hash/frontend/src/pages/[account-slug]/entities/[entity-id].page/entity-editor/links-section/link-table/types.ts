import { SizedGridColumn } from "@glideapps/glide-data-grid";

export type LinkRow = {
  type: string;
  linkedWith: string;
  relationShip: string;
  expectedEntityType: string;
  linkId: string;
};

export type LinkColumnKey = Extract<
  keyof LinkRow,
  "type" | "linkedWith" | "expectedEntityType" | "relationShip"
>;

export interface LinkColumn extends SizedGridColumn {
  id: LinkColumnKey;
}

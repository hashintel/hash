import { SizedGridColumn } from "@glideapps/glide-data-grid";

export type LinkRow = {
  rowId: string;
  linkTitle: string;
  linkedWith: string;
  expectedEntityTypes: string[];
};

export type LinkColumnKey = Extract<
  keyof LinkRow,
  "linkTitle" | "linkedWith" | "expectedEntityTypes"
>;

export interface LinkColumn extends SizedGridColumn {
  id: LinkColumnKey;
}

import { SizedGridColumn } from "@glideapps/glide-data-grid";

export type LinkRow = {
  type: string;
  linkedWith: string;
  relationShip: string;
  expectedEntityType: string;
  linkId: string;
};

export interface LinkColumn extends SizedGridColumn {
  id: keyof LinkRow;
}

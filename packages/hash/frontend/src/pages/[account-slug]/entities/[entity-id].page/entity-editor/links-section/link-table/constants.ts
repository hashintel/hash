import { LinkColumn, LinkRow } from "./types";

export const linkGridColumns: LinkColumn[] = [
  {
    title: "Link Type",
    id: "type",
    width: 200,
  },
  {
    title: "Linked with",
    id: "linkedWith",
    width: 200,
  },
  {
    title: "Relationship",
    id: "relationShip",
    grow: 1,
    width: 200,
  },
  {
    title: "Expected entity type",
    id: "expectedEntityType",
    width: 200,
  },
];

export const linkGridIndexes: Exclude<keyof LinkRow, "linkId">[] = [
  "type",
  "linkedWith",
  "relationShip",
  "expectedEntityType",
];

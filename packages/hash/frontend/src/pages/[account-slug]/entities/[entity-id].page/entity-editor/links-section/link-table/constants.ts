import { LinkColumn, LinkColumnKey } from "./types";

export const linkGridColumns: LinkColumn[] = [
  {
    title: "Link Type",
    id: "linkEntityTypeTitle",
    width: 200,
  },
  {
    title: "Linked with",
    id: "linkedWith",
    width: 200,
  },
  {
    title: "Relationship",
    id: "relationship",
    grow: 1,
    width: 200,
  },
  {
    title: "Expected entity type",
    id: "expectedEntityType",
    width: 200,
  },
];

export const linkGridIndexes: LinkColumnKey[] = [
  "linkEntityTypeTitle",
  "linkedWith",
  "relationship",
  "expectedEntityType",
];

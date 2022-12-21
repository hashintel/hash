import { LinkColumn, LinkColumnKey } from "./types";

export const linkGridColumns: LinkColumn[] = [
  {
    title: "Link",
    id: "linkTitle",
    width: 250,
  },
  {
    title: "Linked with",
    id: "linkedWith",
    width: 250,
    grow: 2,
  },
  {
    title: "Expected entity type",
    id: "expectedEntityTypes",
    width: 250,
    grow: 1,
  },
];

export const linkGridIndexes: LinkColumnKey[] = [
  "linkTitle",
  "linkedWith",
  "expectedEntityTypes",
];

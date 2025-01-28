import type { LinkColumn, LinkColumnKey } from "./types";

export const linkGridColumns: LinkColumn[] = [
  {
    title: "Link",
    id: "linkTitle",
    width: 200,
  },
  {
    title: "Linked with",
    id: "linkedWith",
    width: 400,
    grow: 2,
  },
  {
    title: "Expected entity type",
    id: "expectedEntityTypes",
    width: 200,
    grow: 1,
  },
];

export const linkGridIndexes: LinkColumnKey[] = [
  "linkTitle",
  "linkedWith",
  "expectedEntityTypes",
];

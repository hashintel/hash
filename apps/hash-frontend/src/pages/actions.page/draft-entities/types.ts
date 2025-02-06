import type { BaseUrl } from "@local/hash-graph-types/ontology";

type EntityTypeDisplayInfo = {
  baseUrl: BaseUrl;
  icon: string | undefined;
  isLink: boolean;
  title: string;
  version: number;
};

export type EntityTypeDisplayInfoByBaseUrl = Record<
  BaseUrl,
  EntityTypeDisplayInfo
>;

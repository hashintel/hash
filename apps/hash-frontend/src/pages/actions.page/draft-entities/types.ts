import type { BaseUrl, OntologyTypeVersion } from "@blockprotocol/type-system";

type EntityTypeDisplayInfo = {
  baseUrl: BaseUrl;
  icon: string | undefined;
  isLink: boolean;
  title: string;
  version: OntologyTypeVersion;
};

export type EntityTypeDisplayInfoByBaseUrl = Record<
  BaseUrl,
  EntityTypeDisplayInfo
>;

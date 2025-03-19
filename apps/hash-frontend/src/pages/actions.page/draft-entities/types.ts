import type { BaseUrl } from "@blockprotocol/type-system";

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

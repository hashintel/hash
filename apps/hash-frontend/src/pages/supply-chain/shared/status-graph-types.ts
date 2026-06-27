import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";

const systemTypeBase = "https://hash.ai/@h/types";

const entityTypeId = (slug: string): VersionedUrl =>
  `${systemTypeBase}/entity-type/${slug}/v/1` as VersionedUrl;

const propertyTypeBaseUrl = (slug: string): BaseUrl =>
  `${systemTypeBase}/property-type/${slug}/` as BaseUrl;

export const supplyChainStatusReportEntityTypeId = entityTypeId(
  "supply-chain-status-report",
);

export const supplyChainUserPreferencesEntityTypeId = entityTypeId(
  "supply-chain-user-preferences",
);

export const supplyChainPropertyBaseUrls = {
  productId: propertyTypeBaseUrl("supply-chain-product-id"),
  siteId: propertyTypeBaseUrl("supply-chain-site-id"),
  stepId: propertyTypeBaseUrl("supply-chain-step-id"),
  opportunityType: propertyTypeBaseUrl("supply-chain-opportunity-type"),
  opportunityKind: propertyTypeBaseUrl("supply-chain-opportunity-kind"),
  scopeKey: propertyTypeBaseUrl("supply-chain-scope-key"),
  statusCategory: propertyTypeBaseUrl("supply-chain-status-category"),
  statusText: propertyTypeBaseUrl("supply-chain-status-text"),
  statusReportAuthorId: propertyTypeBaseUrl(
    "supply-chain-status-report-author-id",
  ),
  statusReportCreatedAt: propertyTypeBaseUrl(
    "supply-chain-status-report-created-at",
  ),
  readMarkers: propertyTypeBaseUrl("supply-chain-read-markers"),
  preferencesUserId: propertyTypeBaseUrl("supply-chain-preferences-user-id"),
  preferencesWebId: propertyTypeBaseUrl("supply-chain-preferences-web-id"),
} as const;

export const textDataTypeId =
  "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1" as const;

export const datetimeDataTypeId =
  "https://hash.ai/@h/types/data-type/datetime/v/1" as const;

export const objectDataTypeId =
  "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1" as const;

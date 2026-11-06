import type { IntegrationIconName } from "../integration-icon-catalog";

export type BrandGeographicMarkets = {
  readonly scope: "global" | "regional" | "country" | "local" | "unknown";
  readonly basis:
    | "brand-presence"
    | "business-presence"
    | "digital-service"
    | "service-footprint"
    | "audience"
    | "project-adoption"
    | "institution";
  readonly primaryCountries: readonly string[];
  readonly countries: readonly string[];
  readonly regions: readonly (
    | "Africa"
    | "Asia"
    | "Europe"
    | "NorthAmerica"
    | "SouthAmerica"
    | "Oceania"
  )[];
  readonly countryCoverage: "complete" | "partial" | "not-enumerated";
  readonly localities: readonly {
    readonly country: string;
    readonly name: string;
  }[];
  readonly assessment: "source-supported" | "provisional" | "unknown";
  readonly assessedOn: string;
  readonly verifiedOn: string | null;
  readonly temporalContext: "current" | "historical";
  readonly notes: string;
  readonly sources: readonly {
    readonly url: string;
    readonly checkedOn: string;
    readonly summary: string;
  }[];
  readonly referenceUrls: readonly string[];
  readonly relatedBrand?: IntegrationIconName;
};

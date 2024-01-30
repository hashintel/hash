import { productionCrunchbaseCompanyId } from "@local/hash-isomorphic-utils/production-crunchbase-company-id";

import { LocalStorage } from "../../../../shared/storage";

export const defaultProductionRules: LocalStorage["automaticInferenceConfig"]["rules"] =
  [
    {
      restrictToDomains: ["crunchbase.com"],
      entityTypeId: productionCrunchbaseCompanyId,
    },
    {
      restrictToDomains: ["crunchbase.com"],
      entityTypeId:
        "https://hash.ai/@hash/types/entity-type/crunchbase-person/v/11",
    },
    {
      restrictToDomains: ["crunchbase.com"],
      entityTypeId:
        "https://hash.ai/@hash/types/entity-type/crunchbase-industry/v/1",
    },
    {
      restrictToDomains: ["crunchbase.com"],
      entityTypeId:
        "https://hash.ai/@hash/types/entity-type/crunchbase-diversity-spotlight/v/1",
    },
    {
      restrictToDomains: ["crunchbase.com"],
      entityTypeId:
        "https://hash.ai/@hash/types/entity-type/has-funding-round/v/1",
    },
    {
      restrictToDomains: ["crunchbase.com"],
      entityTypeId:
        "https://hash.ai/@hash/types/entity-type/acquired-entity/v/1",
    },
    {
      restrictToDomains: ["crunchbase.com"],
      entityTypeId: "https://hash.ai/@hash/types/entity-type/has-ipo/v/1",
    },
    {
      restrictToDomains: ["crunchbase.com"],
      entityTypeId:
        "https://hash.ai/@hash/types/entity-type/initial-public-offering/v/3",
    },
    {
      restrictToDomains: ["crunchbase.com"],
      entityTypeId:
        "https://hash.ai/@hash/types/entity-type/listing-occurred-on/v/1",
    },
    {
      restrictToDomains: ["crunchbase.com"],
      entityTypeId:
        "https://hash.ai/@hash/types/entity-type/primary-linkedin-link/v/1",
    },
    {
      restrictToDomains: ["crunchbase.com"],
      entityTypeId:
        "https://hash.ai/@hash/types/entity-type/primary-twitter-link/v/1",
    },
    {
      restrictToDomains: ["crunchbase.com"],
      entityTypeId:
        "https://hash.ai/@hash/types/entity-type/primary-website/v/1",
    },
    {
      restrictToDomains: ["crunchbase.com"],
      entityTypeId:
        "https://hash.ai/@hash/types/entity-type/primary-facebook-link/v/1",
    },
    {
      restrictToDomains: ["crunchbase.com"],
      entityTypeId:
        "https://hash.ai/@hash/types/entity-type/participated-in-by/v/1",
    },
    {
      restrictToDomains: ["crunchbase.com"],
      entityTypeId:
        "https://hash.ai/@hash/types/entity-type/has-board-member/v/1",
    },
    {
      restrictToDomains: ["crunchbase.com"],
      entityTypeId:
        "https://hash.ai/@hash/types/entity-type/securities-offering/v/2",
    },
    {
      restrictToDomains: ["crunchbase.com"],
      entityTypeId: "https://hash.ai/@hash/types/entity-type/stock-symbol/v/3",
    },
    {
      restrictToDomains: ["crunchbase.com"],
      entityTypeId:
        "https://hash.ai/@hash/types/entity-type/stock-exchange/v/1",
    },
    {
      restrictToDomains: ["crunchbase.com"],
      entityTypeId:
        "https://hash.ai/@hash/types/entity-type/is-operated-by/v/1",
    },
    {
      restrictToDomains: ["crunchbase.com"],
      entityTypeId: "https://hash.ai/@hash/types/entity-type/mentioned-in/v/1",
    },
    {
      restrictToDomains: ["crunchbase.com", "linkedin.com"],
      entityTypeId: "https://hash.ai/@hash/types/entity-type/website/v/1",
    },
    {
      restrictToDomains: ["crunchbase.com", "linkedin.com"],
      entityTypeId: "https://hash.ai/@hash/types/entity-type/news-article/v/1",
    },
    {
      restrictToDomains: ["linkedin.com"],
      entityTypeId:
        "https://hash.ai/@hash/types/entity-type/linkedin-account/v/1",
    },
    {
      restrictToDomains: ["linkedin.com"],
      entityTypeId:
        "https://hash.ai/@hash/types/entity-type/linkedin-company-page/v/1",
    },
    {
      restrictToDomains: ["linkedin.com"],
      entityTypeId: "https://hash.ai/@hash/types/entity-type/linkedin-post/v/1",
    },
  ];

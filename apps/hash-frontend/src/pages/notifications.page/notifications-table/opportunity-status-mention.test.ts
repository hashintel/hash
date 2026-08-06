import { describe, expect, it } from "vitest";

import { getOpportunityStatusMentionHref } from "./opportunity-status-mention";

import type { EntityId } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";

const statusUpdate = (properties: Record<string, string>): HashEntity =>
  ({
    metadata: {
      recordId: {
        entityId:
          "00000000-0000-0000-0000-000000000001~00000000-0000-0000-0000-000000000002" as EntityId,
      },
    },
    properties,
  }) as HashEntity;

describe("getOpportunityStatusMentionHref", () => {
  it("opens the site opportunity and focuses the status entity", () => {
    const href = getOpportunityStatusMentionHref(
      statusUpdate({
        "https://hash.ai/@h/types/property-type/scope-key/":
          "site/a::planning::step/1",
        "https://hash.ai/@h/types/property-type/site-code/": "Site A",
      }),
    );

    expect(href).toBe(
      "/supply-chain/site/Site%20A?opportunity=site%2Fa%3A%3Aplanning%3A%3Astep%2F1&statusUpdate=00000000-0000-0000-0000-000000000002",
    );
  });

  it("returns undefined when routing properties are unavailable", () => {
    expect(getOpportunityStatusMentionHref(statusUpdate({}))).toBeUndefined();
  });
});

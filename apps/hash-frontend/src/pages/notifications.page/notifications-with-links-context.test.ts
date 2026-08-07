import { describe, expect, it } from "vitest";

import {
  blockProtocolPropertyTypes,
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import {
  getEntityMentionKind,
  getOpportunityStatusNotificationContext,
} from "./notifications-with-links-context";

import type { EntityId } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";

const recipientEntityId =
  "00000000-0000-0000-0000-000000000001~00000000-0000-0000-0000-000000000002" as EntityId;

const status = (textualContent: unknown[]): HashEntity =>
  ({
    metadata: {
      entityTypeIds: [systemEntityTypes.opportunityStatusUpdate.entityTypeId],
    },
    properties: {
      [blockProtocolPropertyTypes.textualContent.propertyTypeBaseUrl]:
        textualContent,
    },
  }) as unknown as HashEntity;

describe("getEntityMentionKind", () => {
  it("distinguishes direct mentions from participation notifications", () => {
    expect(
      getEntityMentionKind(
        status([
          {
            entityId: recipientEntityId,
            mentionType: "user",
            tokenType: "mention",
          },
        ]),
        recipientEntityId,
      ),
    ).toBe("opportunity-status-mention");

    expect(
      getEntityMentionKind(
        status([{ tokenType: "text", text: "General update" }]),
        recipientEntityId,
      ),
    ).toBe("opportunity-status-participation");
  });

  it("extracts the human-readable opportunity context", () => {
    const statusUpdate = status([
      { tokenType: "text", text: "Investigation started" },
    ]);
    statusUpdate.properties[systemPropertyTypes.title.propertyTypeBaseUrl] =
      "QA hold: Product A";
    statusUpdate.properties[systemPropertyTypes.siteCode.propertyTypeBaseUrl] =
      "Cork";

    expect(getOpportunityStatusNotificationContext(statusUpdate)).toEqual({
      opportunityLabel: "QA hold: Product A",
      opportunitySiteCode: "Cork",
    });
  });
});

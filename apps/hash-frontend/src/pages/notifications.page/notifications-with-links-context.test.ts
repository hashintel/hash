import { describe, expect, it } from "vitest";

import {
  blockProtocolPropertyTypes,
  systemEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import { getEntityMentionKind } from "./notifications-with-links-context";

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
});

import "../../../../shared/testing-utilities/mock-get-flow-context.js";

import type { EntityUuid } from "@local/hash-graph-types/entity";
import type { OwnedById } from "@local/hash-graph-types/web";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { entityIdFromComponents } from "@local/hash-subgraph";
import { expect, test } from "vitest";

import { getDereferencedEntityTypesActivity } from "../../../get-dereferenced-entity-types-activity.js";
import { getWebPageActivity } from "../../../get-web-page-activity.js";
import { getFlowContext } from "../../../shared/get-flow-context.js";
import { graphApiClient } from "../../../shared/graph-api-client.js";
import { inferEntityClaimsFromTextAgent } from "./infer-entity-claims-from-text-agent.js";

const ownedById = generateUuid();

const generateEntityId = (entityUuid: string) =>
  entityIdFromComponents(ownedById as OwnedById, entityUuid as EntityUuid);

test.skip(
  "Test inferEntityClaimsFromText with the FTSE350 table",
  async () => {
    const { userAuthentication } = await getFlowContext();

    const dereferencedEntityTypes = await getDereferencedEntityTypesActivity({
      entityTypeIds: [
        "https://hash.ai/@ftse/types/entity-type/stock-market-constituent/v/1",
      ],
      actorId: userAuthentication.actorId,
      graphApiClient,
      simplifyPropertyKeys: true,
    });

    const dereferencedEntityType = Object.values(dereferencedEntityTypes)[0]!
      .schema;

    const url =
      "https://www.londonstockexchange.com/indices/ftse-350/constituents/table";

    const webPage = await getWebPageActivity({
      url,
      sanitizeForLlm: true,
    });

    if ("error" in webPage) {
      throw new Error(webPage.error);
    }

    const { htmlContent } = webPage;

    const { claims } = await inferEntityClaimsFromTextAgent({
      text: htmlContent,
      url,
      title: webPage.title,
      dereferencedEntityType,
      contentType: "webpage",
      linkEntityTypesById: {},
      goal: "Find information about FTSE350 constituents.",
      subjectEntities: [
        {
          localId: generateEntityId("6675a4ca-2282-4823-a4ff-d65d87218ebd"),
          name: "MOLTEN VENTURES PLC ORD GBP0.01",
          summary:
            "MOLTEN VENTURES PLC is a technology investment company that invests in early-stage technology businesses.",
          entityTypeId:
            "https://hash.ai/@ftse/types/entity-type/stock-market-constituent/v/1",
        },
      ],
      potentialObjectEntities: [],
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ claims }, null, 2));

    expect(claims).toBeDefined();
  },
  {
    timeout: 5 * 60 * 1000,
  },
);

test.skip(
  "Test inferEntityClaimsFromText for the GeForce RTX 4090 graphics card",
  async () => {
    const { userAuthentication } = await getFlowContext();

    const dereferencedEntityTypes = await getDereferencedEntityTypesActivity({
      entityTypeIds: [
        "https://hash.ai/@ftse/types/entity-type/graphics-card/v/1",
      ],
      actorId: userAuthentication.actorId,
      graphApiClient,
      simplifyPropertyKeys: true,
    });

    const dereferencedEntityType = Object.values(dereferencedEntityTypes)[0]!
      .schema;

    const url =
      "https://www.nvidia.com/de-de/geforce/graphics-cards/40-series/rtx-4090/";

    const webPage = await getWebPageActivity({
      url,
      sanitizeForLlm: true,
    });

    if ("error" in webPage) {
      throw new Error(webPage.error);
    }

    const { htmlContent } = webPage;

    const { claims } = await inferEntityClaimsFromTextAgent({
      text: htmlContent,
      url,
      goal: "Find information about graphics cards",
      title: webPage.title,
      dereferencedEntityType,
      contentType: "webpage",
      linkEntityTypesById: {},
      subjectEntities: [
        {
          localId: generateEntityId("6675a4ca-2282-4823-a4ff-d65d87218ebd"),
          name: "GeForce RTX 4090",
          summary: "The GeForce RTX 4090 is a high-end graphics card.",
          entityTypeId:
            "https://hash.ai/@ftse/types/entity-type/graphics-card/v/1",
        },
      ],
      potentialObjectEntities: [],
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ claims }, null, 2));

    expect(claims).toBeDefined();
  },
  {
    timeout: 5 * 60 * 1000,
  },
);

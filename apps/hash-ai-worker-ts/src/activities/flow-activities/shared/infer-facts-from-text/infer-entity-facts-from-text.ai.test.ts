import "../../../../shared/testing-utilities/mock-get-flow-context";

import { expect, test } from "vitest";

import { getDereferencedEntityTypesActivity } from "../../../get-dereferenced-entity-types-activity";
import { getWebPageActivity } from "../../../get-web-page-activity";
import { getFlowContext } from "../../../shared/get-flow-context";
import { graphApiClient } from "../../../shared/graph-api-client";
import { inferEntityFactsFromTextAgent } from "./infer-entity-facts-from-text-agent";

test.skip(
  "Test inferEntityFactsFromText with the FTSE350 table",
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

    const webPage = await getWebPageActivity({
      url: "https://www.londonstockexchange.com/indices/ftse-350/constituents/table",
      sanitizeForLlm: true,
    });

    if ("error" in webPage) {
      throw new Error(webPage.error);
    }

    const { htmlContent } = webPage;

    const { facts } = await inferEntityFactsFromTextAgent({
      text: htmlContent,
      dereferencedEntityType,
      subjectEntities: [
        {
          localId: "6675a4ca-2282-4823-a4ff-d65d87218ebd",
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
    console.log(JSON.stringify({ facts }, null, 2));

    expect(facts).toBeDefined();
  },
  {
    timeout: 5 * 60 * 1000,
  },
);

test.skip(
  "Test inferEntityFactsFromText for the GeForce RTX 4090 graphics card",
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

    const webPage = await getWebPageActivity({
      url: "https://www.nvidia.com/de-de/geforce/graphics-cards/40-series/rtx-4090/",
      sanitizeForLlm: true,
    });

    if ("error" in webPage) {
      throw new Error(webPage.error);
    }

    const { htmlContent } = webPage;

    const { facts } = await inferEntityFactsFromTextAgent({
      text: htmlContent,
      dereferencedEntityType,
      subjectEntities: [
        {
          localId: "6675a4ca-2282-4823-a4ff-d65d87218ebd",
          name: "GeForce RTX 4090",
          summary: "The GeForce RTX 4090 is a high-end graphics card.",
          entityTypeId:
            "https://hash.ai/@ftse/types/entity-type/graphics-card/v/1",
        },
      ],
      potentialObjectEntities: [],
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ facts }, null, 2));

    expect(facts).toBeDefined();
  },
  {
    timeout: 5 * 60 * 1000,
  },
);

import "../../../../shared/testing-utilities/mock-get-flow-context.js";

import { expect, test } from "vitest";

import { getDereferencedEntityTypesActivity } from "../../../get-dereferenced-entity-types-activity.js";
import { getWebPageActivity } from "../../../get-web-page-activity.js";
import { getFlowContext } from "../../../shared/get-flow-context.js";
import { graphApiClient } from "../../../shared/graph-api-client.js";
import { getEntitySummariesFromText } from "./get-entity-summaries-from-text.js";

test.skip(
  "Test getEntitySummariesFromText with a FTSE350 table",
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

    const { entitySummaries } = await getEntitySummariesFromText({
      text: htmlContent,
      dereferencedEntityType,
      existingSummaries: [],
      relevantEntitiesPrompt: "Obtain the FTSE350 constituents from the table.",
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ entitySummaries }, null, 2));

    expect(entitySummaries).toBeDefined();
    expect(entitySummaries.length).toBe(20);
  },
  {
    timeout: 5 * 60 * 1000,
  },
);

test.skip(
  "Test getEntitySummariesFromText with Sora paper authors",
  async () => {
    const { userAuthentication } = await getFlowContext();

    const dereferencedEntityTypes = await getDereferencedEntityTypesActivity({
      entityTypeIds: [
        "https://hash.ai/@ftse/types/entity-type/person/v/1",
        "https://hash.ai/@ftse/types/entity-type/has-author/v/1",
        "https://hash.ai/@ftse/types/entity-type/research-paper/v/1",
      ],
      actorId: userAuthentication.actorId,
      graphApiClient,
      simplifyPropertyKeys: true,
    });

    const dereferencedEntityType = Object.values(dereferencedEntityTypes)[0]!
      .schema;

    const webPage = await getWebPageActivity({
      url: "https://openai.com/index/video-generation-models-as-world-simulators/",
      sanitizeForLlm: true,
    });

    if ("error" in webPage) {
      throw new Error(webPage.error);
    }

    const { htmlContent } = webPage;

    const { entitySummaries } = await getEntitySummariesFromText({
      text: htmlContent,
      dereferencedEntityType,
      existingSummaries: [],
      relevantEntitiesPrompt:
        'Obtain the authors of the "Video generation models as world simulators" article',
    });

    expect(entitySummaries).toBeDefined();
    expect(entitySummaries.length).toBe(13);
  },
  {
    timeout: 5 * 60 * 1000,
  },
);

test.skip(
  "Test getEntitySummariesFromText with church lab members",
  async () => {
    const { userAuthentication } = await getFlowContext();

    const dereferencedEntityTypes = await getDereferencedEntityTypesActivity({
      entityTypeIds: ["https://hash.ai/@ftse/types/entity-type/person/v/1"],
      actorId: userAuthentication.actorId,
      graphApiClient,
      simplifyPropertyKeys: true,
    });

    const dereferencedEntityType = Object.values(dereferencedEntityTypes)[0]!
      .schema;

    const webPage = await getWebPageActivity({
      url: "https://churchlab.hms.harvard.edu/index.php/lab-members#current",
      sanitizeForLlm: true,
    });

    if ("error" in webPage) {
      throw new Error(webPage.error);
    }

    const { htmlContent } = webPage;

    const { entitySummaries } = await getEntitySummariesFromText({
      text: htmlContent,
      dereferencedEntityType,
      existingSummaries: [],
      relevantEntitiesPrompt:
        "Obtain the full list of the current members of Church Lab",
    });

    expect(entitySummaries).toBeDefined();
  },
  {
    timeout: 5 * 60 * 1000,
  },
);

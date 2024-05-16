import "../../../../shared/testing-utilities/mock-get-flow-context";

import { expect, test } from "vitest";

import { getDereferencedEntityTypesActivity } from "../../../get-dereferenced-entity-types-activity";
import { getWebPageActivity } from "../../../get-web-page-activity";
import { getFlowContext } from "../../../shared/get-flow-context";
import { graphApiClient } from "../../../shared/graph-api-client";
import { getEntitySummariesFromText } from "./get-entity-summaries-from-text";

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

    const { htmlContent } = await getWebPageActivity({
      url: "https://www.londonstockexchange.com/indices/ftse-350/constituents/table",
      sanitizeForLlm: true,
    });

    const { entitySummaries } = await getEntitySummariesFromText({
      text: htmlContent,
      dereferencedEntityType,
    });

    expect(entitySummaries).toBeDefined();
  },
  {
    timeout: 5 * 60 * 1000,
  },
);

test(
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

    const { htmlContent } = await getWebPageActivity({
      url: "https://openai.com/index/video-generation-models-as-world-simulators/",
      sanitizeForLlm: true,
    });

    const { entitySummaries } = await getEntitySummariesFromText({
      text: htmlContent,
      dereferencedEntityType,
      relevantEntitiesPrompt:
        'Obtain the authors of the "Video generation models as world simulators" paper',
    });

    expect(entitySummaries).toBeDefined();
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

    const { htmlContent } = await getWebPageActivity({
      url: "https://churchlab.hms.harvard.edu/index.php/lab-members#current",
      sanitizeForLlm: true,
    });

    const { entitySummaries } = await getEntitySummariesFromText({
      text: htmlContent,
      dereferencedEntityType,
      relevantEntitiesPrompt:
        "Obtain the full list of current members of Church Lab",
    });

    expect(entitySummaries).toBeDefined();
  },
  {
    timeout: 5 * 60 * 1000,
  },
);

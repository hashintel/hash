import "../../../../shared/testing-utilities/mock-get-flow-context";

import { expect, test } from "vitest";

import { getDereferencedEntityTypesActivity } from "../../../get-dereferenced-entity-types-activity";
import { getFlowContext } from "../../../shared/get-flow-context";
import { graphApiClient } from "../../../shared/graph-api-client";
import { inferFactsFromWebPageWorkerAgent } from "../infer-facts-from-web-page-worker-agent";

test.skip(
  "Test inferFactsFromWebPageWorkerAgent for Church Lab members",
  async () => {
    const { userAuthentication } = await getFlowContext();

    const dereferencedEntityTypes = await getDereferencedEntityTypesActivity({
      entityTypeIds: ["https://hash.ai/@ftse/types/entity-type/person/v/1"],
      actorId: userAuthentication.actorId,
      graphApiClient,
      simplifyPropertyKeys: true,
    });

    const status = await inferFactsFromWebPageWorkerAgent({
      prompt: "Obtain the full list of current members of Church Lab",
      entityTypes: Object.values(dereferencedEntityTypes).map(
        ({ schema }) => schema,
      ),
      url: "https://churchlab.hms.harvard.edu/index.php/lab-members#current",
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ status }, null, 2));

    expect(status).toBeDefined();
  },
  {
    timeout: 5 * 60 * 1000,
  },
);

test.skip(
  "Test inferFactsFromWebPageWorkerAgent for Sora article authors",
  async () => {
    const { userAuthentication } = await getFlowContext();

    const dereferencedEntityTypes = await getDereferencedEntityTypesActivity({
      entityTypeIds: ["https://hash.ai/@ftse/types/entity-type/person/v/1"],
      actorId: userAuthentication.actorId,
      graphApiClient,
      simplifyPropertyKeys: true,
    });

    const status = await inferFactsFromWebPageWorkerAgent({
      prompt:
        'Obtain the full list of authors of the Sora article titled "Video Generation Models as World Simulators"',
      entityTypes: Object.values(dereferencedEntityTypes).map(
        ({ schema }) => schema,
      ),
      url: "https://openai.com/index/video-generation-models-as-world-simulators/",
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ status }, null, 2));

    expect(status).toBeDefined();
  },
  {
    timeout: 5 * 60 * 1000,
  },
);

import "../../../../shared/testing-utilities/mock-get-flow-context.js";

import { expect, test } from "vitest";

import { getDereferencedEntityTypesActivity } from "../../../get-dereferenced-entity-types-activity.js";
import { getFlowContext } from "../../../shared/get-flow-context.js";
import { graphApiClient } from "../../../shared/graph-api-client.js";
import { linkFollowerAgent } from "../link-follower-agent";

test.skip(
  "Test linkFollowerAgent for Church Lab members",
  async () => {
    const { userAuthentication } = await getFlowContext();

    const dereferencedEntityTypes = await getDereferencedEntityTypesActivity({
      entityTypeIds: ["https://hash.ai/@ftse/types/entity-type/person/v/1"],
      actorId: userAuthentication.actorId,
      graphApiClient,
      simplifyPropertyKeys: true,
    });

    const status = await linkFollowerAgent({
      task: "Obtain the full list of current members of Church Lab",
      entityTypes: Object.values(dereferencedEntityTypes).map(
        ({ schema }) => schema,
      ),
      existingEntitiesOfInterest: [],
      initialResource: {
        url: "https://churchlab.hms.harvard.edu/index.php/lab-members#current",
        exampleOfExpectedContent: "Current Members: ...",
        descriptionOfExpectedContent:
          "The current members of the lab are listed on the page.",
        reason: "The page should include the current members of the lab.",
      },
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
  "Test linkFollowerAgent for Sora article authors",
  async () => {
    const { userAuthentication } = await getFlowContext();

    const dereferencedEntityTypes = await getDereferencedEntityTypesActivity({
      entityTypeIds: ["https://hash.ai/@ftse/types/entity-type/person/v/1"],
      actorId: userAuthentication.actorId,
      graphApiClient,
      simplifyPropertyKeys: true,
    });

    const status = await linkFollowerAgent({
      task: 'Obtain the full list of authors of the Sora article titled "Video Generation Models as World Simulators"',
      entityTypes: Object.values(dereferencedEntityTypes).map(
        ({ schema }) => schema,
      ),
      existingEntitiesOfInterest: [],
      initialResource: {
        url: "https://openai.com/index/video-generation-models-as-world-simulators/",
        exampleOfExpectedContent: "Authors: ...",
        descriptionOfExpectedContent:
          "The authors of the article are listed at the bottom of the page.",
        reason: "The article should include the authors.",
      },
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
  "Test linkFollowerAgent: FTSE350 constituents",
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

    const status = await linkFollowerAgent({
      task: "Get all the stock market constituents of the FTSE350.",
      entityTypes: Object.values(dereferencedEntityTypes).map(
        ({ schema }) => schema,
      ),
      existingEntitiesOfInterest: [],
      initialResource: {
        url: "https://www.londonstockexchange.com/indices/ftse-350/constituents/table",
        exampleOfExpectedContent: "Constituents: ...",
        descriptionOfExpectedContent:
          "The constituents of the FTSE350 are listed on the page.",
        reason: "The page should include the constituents of the FTSE350.",
      },
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ status }, null, 2));

    expect(status).toBeDefined();
  },
  {
    timeout: 10 * 60 * 1000,
  },
);

test.skip(
  "Test linkFollowerAgent: top 3 graphics cards",
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

    const status = await linkFollowerAgent({
      task: "Identify the top 3 graphics cards suitable for AI model processing, including their specifications and features.",
      entityTypes: Object.values(dereferencedEntityTypes).map(
        ({ schema }) => schema,
      ),
      existingEntitiesOfInterest: [],
      initialResource: {
        url: "https://www.gpu-mart.com/blog/best-gpus-for-deep-learning-2023",
        exampleOfExpectedContent: "Graphics Cards: ...",
        descriptionOfExpectedContent:
          "The top 3 graphics cards for AI model processing are listed on the page.",
        reason:
          "The page should include the top 3 graphics cards for AI model processing.",
      },
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ status }, null, 2));

    expect(status).toBeDefined();
  },
  {
    timeout: 10 * 60 * 1000,
  },
);

test.skip(
  "Test linkFollowerAgent for getting investors of M & S",
  async () => {
    const { userAuthentication } = await getFlowContext();

    const dereferencedEntityTypes = await getDereferencedEntityTypesActivity({
      entityTypeIds: [
        "https://hash.ai/@ftse/types/entity-type/investment-fund/v/1",
      ],
      actorId: userAuthentication.actorId,
      graphApiClient,
      simplifyPropertyKeys: true,
    });

    const status = await linkFollowerAgent({
      task: "Get the list of investors of Marks and Spencer's, based on the 2023 annual investors report PDF file.",
      entityTypes: Object.values(dereferencedEntityTypes).map(
        ({ schema }) => schema,
      ),
      existingEntitiesOfInterest: [],
      initialResource: {
        url: "https://corporate.marksandspencer.com/investors",
        exampleOfExpectedContent: "Investors: ...",
        descriptionOfExpectedContent:
          "The investors of Marks and Spencer's are listed on the page.",
        reason: "The page should include the investors of Marks and Spencer's.",
      },
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ status }, null, 2));

    expect(status).toBeDefined();
  },
  {
    timeout: 5 * 60 * 1000,
  },
);

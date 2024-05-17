import "../../../shared/testing-utilities/mock-get-flow-context";

import { expect, test } from "vitest";

import { researchEntitiesAction } from "../research-entities-action";

test(
  "Test researchEntitiesAction: find subsidiary companies of Google",
  async () => {
    const status = await researchEntitiesAction({
      inputs: [
        {
          inputName: "prompt",
          payload: {
            kind: "Text",
            value: "Find 3 subsidiary companies of Google",
          },
        },
        {
          inputName: "entityTypeIds",
          payload: {
            kind: "VersionedUrl",
            value: ["https://hash.ai/@ftse/types/entity-type/company/v/1"],
          },
        },
      ],
      testingParams: {
        humanInputCanBeRequested: false,
      },
    });

    expect(status).toBeDefined();
  },
  {
    timeout: 5 * 60 * 1000,
  },
);

test.skip(
  "Test researchEntitiesAction: find the authors of the 'Video generation models as world simulators' article",
  async () => {
    const status = await researchEntitiesAction({
      inputs: [
        {
          inputName: "prompt",
          payload: {
            kind: "Text",
            value:
              'Obtain the authors of the "Video generation models as world simulators" article',
          },
        },
        {
          inputName: "entityTypeIds",
          payload: {
            kind: "VersionedUrl",
            value: ["https://hash.ai/@ftse/types/entity-type/person/v/1"],
          },
        },
      ],
      testingParams: {
        humanInputCanBeRequested: false,
      },
    });

    expect(status).toBeDefined();
  },
  {
    timeout: 5 * 60 * 1000,
  },
);

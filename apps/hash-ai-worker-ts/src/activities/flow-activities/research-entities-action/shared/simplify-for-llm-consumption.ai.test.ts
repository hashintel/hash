import "../../../../shared/testing-utilities/mock-get-flow-context.js";
import { expect, test } from "vitest";

import { getDereferencedEntityTypesActivity } from "../../../get-dereferenced-entity-types-activity.js";
import { getFlowContext } from "../../../shared/get-flow-context.js";
import { graphApiClient } from "../../../shared/graph-api-client.js";

import { simplifyEntityTypeForLlmConsumption } from "./simplify-for-llm-consumption.js";

test("test researchEntitiesAction: find subsidiary companies of Google", async () => {
  const { userAuthentication } = await getFlowContext();

  const dereferencedEntityTypes = await getDereferencedEntityTypesActivity({
    entityTypeIds: [
      "https://hash.ai/@ftse/types/entity-type/stock-market-constituent/v/1",
    ],
    actorId: userAuthentication.actorId,
    graphApiClient,
    simplifyPropertyKeys: true,
  });

  const simplifiedEntityType = simplifyEntityTypeForLlmConsumption({
    entityType: Object.values(dereferencedEntityTypes)[0]!.schema,
  });

  // eslint-disable-next-line no-console
  console.log(simplifiedEntityType);

  expect(simplifiedEntityType).toBeDefined();
});

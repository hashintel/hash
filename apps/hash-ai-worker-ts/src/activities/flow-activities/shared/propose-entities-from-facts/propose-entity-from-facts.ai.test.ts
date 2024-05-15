import "../../../../shared/testing-utilities/mock-get-flow-context";

import { expect, test } from "vitest";

import { getDereferencedEntityTypesActivity } from "../../../get-dereferenced-entity-types-activity";
import { getFlowContext } from "../../../shared/get-flow-context";
import { graphApiClient } from "../../../shared/graph-api-client";
import type { EntitySummary } from "../infer-facts-from-text/get-entity-summaries-from-text";
import { proposeEntityFromFacts } from "./propose-entity-from-facts";

const huntingPlcEntitySummary: EntitySummary = {
  localId: "6916156b-e759-41ad-b1da-2cf7af05d223",
  name: "HUNTING PLC ORD 25P",
  summary:
    "HUNTING PLC, represented by the stock code HTG, has a market cap of 614.40 million GBX, a last recorded price of 452.50 GBX, and experienced a recent price change of 80.00 GBX, translating to a 21.48% increase.",
  entityTypeId:
    "https://hash.ai/@ftse/types/entity-type/stock-market-constituent/v/1",
};

const huntingPlcEntityFacts = [
  {
    text: "HUNTING PLC has a market cap of 614.40 million GBX",
    subjectEntityLocalId: "66f93842-c6e0-4378-ab04-519edd7231af",
    prepositionalPhrases: [],
  },
  {
    text: "HUNTING PLC has a price of 443.50 GBX",
    subjectEntityLocalId: "66f93842-c6e0-4378-ab04-519edd7231af",
    prepositionalPhrases: [],
  },
  {
    text: "HUNTING PLC has a change value of 71.00 GBX",
    subjectEntityLocalId: "66f93842-c6e0-4378-ab04-519edd7231af",
    prepositionalPhrases: [],
  },
  {
    text: "HUNTING PLC has a change percentage of 19.06%",
    subjectEntityLocalId: "66f93842-c6e0-4378-ab04-519edd7231af",
    prepositionalPhrases: [],
  },
];

test(
  "Test proposeEntityFromFacts",
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

    const { schema: dereferencedEntityType, simplifiedPropertyTypeMappings } =
      Object.values(dereferencedEntityTypes)[0]!;

    const proposeEntityFromFactsStatus = await proposeEntityFromFacts({
      entitySummary: huntingPlcEntitySummary,
      facts: huntingPlcEntityFacts,
      dereferencedEntityType,
      simplifiedPropertyTypeMappings: simplifiedPropertyTypeMappings!,
    });

    expect(proposeEntityFromFactsStatus).toBeDefined();
  },
  {
    timeout: 5 * 60 * 1000,
  },
);

import { typedActionDefinitions as actions } from "./action-definitions.js";
import { constant, defineFlow, flowInput } from "./define-flow.js";

/**
 * Researches the FTSE350's constituents, then each constituent's investors in a for-each step.
 *
 * This flow is not seeded: it exists to exercise for-each steps (in the builder, validator, engine and Petri net
 * compiler), and can be previewed as a Petri net on `/processes`.
 */
export const ftseInvestorsFlow = defineFlow(
  {
    /* ftse-350-investors */
    flowDefinitionId: "25f32cd2-6f6e-5641-92b7-d9a90e517e0f",
    name: "FTSE350 investors",
    description:
      "Research the FTSE350 index, its constituents, and the top investors in the index",
    inputs: {
      draft: flowInput("Boolean", { required: false }),
    },
  },
  ({ inputs, step, forEach }) => {
    const researchConstituents = step("1", actions.researchEntities, {
      description: "Research the constituents of the FTSE350 index",
      inputs: {
        prompt: constant("Text", "Find the constituents in the FTSE350 index"),
        entityTypeIds: constant("VersionedUrl", [
          "https://hash.ai/@h/types/entity-type/stock-market-constituent/v/1",
          "https://hash.ai/@h/types/entity-type/stock-market-index/v/1",
        ]),
      },
    });

    const persistConstituents = step("2", actions.persistEntities, {
      description: "Save discovered members of the FTSE350 to HASH graph",
      inputs: {
        proposedEntities: researchConstituents.outputs.proposedEntities,
        draft: inputs.draft,
      },
    });

    const investors = forEach(
      "3",
      persistConstituents.outputs.persistedEntities,
      {
        description: "Research investors and investments in FTSE350 companies",
        collectAs: "persistedEntities",
        steps: (constituent, scope) => {
          const researchInvestors = scope.step(
            "3.1",
            actions.researchEntities,
            {
              description:
                "Research investors and investments in a FTSE350 company",
              inputs: {
                prompt: constant(
                  "Text",
                  "Find the investors in the provided FTSE350 constituent, and their investments in that company",
                ),
                entityTypeIds: constant("VersionedUrl", [
                  "https://hash.ai/@h/types/entity-type/invested-in/v/1",
                  "https://hash.ai/@h/types/entity-type/investment-fund/v/1",
                  "https://hash.ai/@h/types/entity-type/company/v/1",
                ]),
                existingEntities: constituent.wrap(),
              },
            },
          );

          return scope.step("3.2", actions.persistEntities, {
            description:
              "Save discovered FTSE350 investors and their investments to HASH graph",
            inputs: {
              proposedEntities: researchInvestors.outputs.proposedEntities,
              draft: inputs.draft.read(),
            },
          }).outputs.persistedEntities;
        },
      },
    );

    const answer = step("4", actions.answerQuestion, {
      description:
        "Calculate the top 10 investors in the FTSE350 by market cap",
      inputs: {
        question: constant(
          "Text",
          "Who are the top 10 investors in the FTSE350 by market cap?",
        ),
        entities: investors,
      },
    });

    return {
      outputs: {
        persistedEntities: investors,
        answer: answer.outputs.answer,
      },
    };
  },
);

import dedent from "dedent";

import type { LocalEntitySummary } from "../shared/infer-facts-from-text/get-entity-summaries-from-text.js";
import type { Fact } from "../shared/infer-facts-from-text/types.js";

export const generatePreviouslyInferredFactsSystemPromptMessage = (params: {
  entitySummaries: LocalEntitySummary[];
  inferredFacts: Fact[];
}) => {
  const { entitySummaries, inferredFacts } = params;

  return entitySummaries.length > 0
    ? dedent(`
    You have previously obtained facts about the following entities:
    ${entitySummaries
      .map((entitySummary) => {
        const factsWithEntityAsSubject = inferredFacts.filter(
          (fact) => fact.subjectEntityLocalId === entitySummary.localId,
        );

        return dedent(`
          Entity ID: ${entitySummary.localId}
          Entity Name: ${entitySummary.name}
          Entity Summary: ${entitySummary.summary}
          Entity Type Id: ${entitySummary.entityTypeId}
          Entity facts: ${JSON.stringify(
            factsWithEntityAsSubject.map(
              ({ text, prepositionalPhrases }) =>
                `${text} ${prepositionalPhrases.join(", ")}`,
            ),
          )}
        `);
      })
      .join("\n")}
  `)
    : "You have not yet obtained facts about any entities.";
};

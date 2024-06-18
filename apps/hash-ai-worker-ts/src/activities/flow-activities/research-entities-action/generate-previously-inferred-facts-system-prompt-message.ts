import dedent from "dedent";

import type { LocalEntitySummary } from "../shared/infer-facts-from-text/get-entity-summaries-from-text";
import type { Fact } from "../shared/infer-facts-from-text/types";

export const generatePreviouslyInferredFactsSystemPromptMessage = (params: {
  inferredFactsAboutEntities: LocalEntitySummary[];
  inferredFacts: Fact[];
}) => {
  const { inferredFactsAboutEntities, inferredFacts } = params;

  return inferredFactsAboutEntities.length > 0
    ? dedent(`
    You have previously obtained facts about the following entities:
    ${inferredFactsAboutEntities
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

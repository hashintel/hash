import dedent from "dedent";

import type { LlmMessageTextContent } from "../../../shared/get-llm-response/llm-message.js";
import { generateOutstandingTasksDescription } from "../shared/coordinator-tools.js";
import type {
  CoordinatingAgentInput,
  CoordinatingAgentState,
} from "../shared/coordinators.js";
import {
  simplifyEntityTypeForLlmConsumption,
  simplifyProposedEntityForLlmConsumption,
} from "../shared/simplify-for-llm-consumption.js";

export const generateProgressReport = (params: {
  input: CoordinatingAgentInput;
  state: CoordinatingAgentState;
}): LlmMessageTextContent => {
  const { state, input } = params;

  const {
    delegatedTasksCompleted,
    suggestionsForNextStepsMade,
    resourcesNotVisited,
    resourceUrlsVisited,
    webQueriesMade,
  } = state;

  const { allDereferencedEntityTypesById } = input;

  const proposedEntities = state.proposedEntities.filter(
    (proposedEntity) => !("sourceEntityId" in proposedEntity),
  );

  const proposedLinks = state.proposedEntities.filter(
    (proposedEntity) => "sourceEntityId" in proposedEntity,
  );

  let progressReport = state.plan
    ? dedent`You have previously proposed the following plan:
      ${state.plan}

      If you want to deviate from this plan or improve it, update it using the "updatePlan" tool.
      You must call the "updatePlan" tool alongside other tool calls to progress towards completing the task.\n\n
      `
    : "";

  if (proposedEntities.length > 0 || proposedLinks.length > 0) {
    progressReport +=
      "Here's what we've discovered so far. If this is sufficient to satisfy the research brief, call 'complete' with the entityIds of the entities and links of interest:\n\n";
    if (proposedEntities.length > 0) {
      progressReport += dedent(`
      <DiscoveredEntities>
      ${proposedEntities
        .map((proposedEntity) =>
          simplifyProposedEntityForLlmConsumption({
            proposedEntity,
            entityType:
              allDereferencedEntityTypesById[proposedEntity.entityTypeId]!,
          }),
        )
        .join("\n")}
      </DiscoveredEntities>
    `);
    }
    if (proposedLinks.length > 0) {
      progressReport += dedent(`
      <DiscoveredLinks>
      ${proposedLinks
        .map((proposedLink) =>
          simplifyProposedEntityForLlmConsumption({
            proposedEntity: proposedLink,
            entityType:
              allDereferencedEntityTypesById[proposedLink.entityTypeId]!,
          }),
        )
        .join("\n")}
      </DiscoveredLinks>
    `);
    }

    progressReport += dedent`
    If further research is needed to fill more properties of any entities or links,
      consider defining them as sub-tasks via the "delegateResearchTask" tool.

    Do not sequentially conduct additional actions for each of the entities,
      instead start multiple sub-tasks via the "delegateResearchTask" tool to
      conduct additional research per entity in parallel.`;
  }
  if (
    resourceUrlsVisited.length > 0 ||
    resourcesNotVisited.length > 0 ||
    webQueriesMade.length > 0
  ) {
    if (resourceUrlsVisited.length > 0) {
      progressReport += dedent(`
        You have discovered the following resources via web searches but noy yet visited them. It may be worth inferring claims from the URL.
        <ResourcesNotVisited>
        ${resourcesNotVisited
          .map(
            (webPage) =>
              `
<Resource>
  <Url>${webPage.url}</Url>
  <Summary>${webPage.summary}</Summary>
  <FromWebSearch>"${webPage.fromSearchQuery}"</FromWebSearch>
</Resource>`,
          )
          .join("\n")}
        </ResourcesNotVisited>
      `);
    }
    if (resourceUrlsVisited.length > 0) {
      progressReport += dedent(`
        You have already visited the following resources – do not visit them again. They are included for your reference for work done only:
        <ResourcesVisited>
          ${resourceUrlsVisited.join("\n")}
        </ResourcesVisited>
      `);
    }
    if (webQueriesMade.length > 0) {
      progressReport += dedent(`
        You have made the following web searches – there is no point in making these or very similar searches again:
        <WebSearchesMade>
        ${webQueriesMade.join("\n")}
        </WebSearchesMade>
      `);
    }
  }

  if (suggestionsForNextStepsMade.length > 0) {
    progressReport += dedent(`
      We have received the following suggestions for next steps (some may now be redundant or already have been acted upon):
      <SuggestionsForNextSteps>
      ${suggestionsForNextStepsMade.join("\n")}
      </SuggestionsForNextSteps>
    `);
  }

  if (delegatedTasksCompleted.length > 0) {
    progressReport += dedent(`
      The following delegated tasks have been completed (they may not have been completely successful):
      <DelegatedTasksCompleted>
      ${delegatedTasksCompleted.join("\n")}
      </DelegatedTasksCompleted>
    `);
  }

  progressReport += dedent(`
    Now decide what to do next. Pay close attention to any missing properties on entities, and consider doing work to populate them.
    
    ${generateOutstandingTasksDescription(state)}
  `);

  return {
    type: "text",
    text: progressReport,
  };
};

export const generateSystemPromptPrefix = (params: {
  input: CoordinatingAgentInput;
}) => {
  const { linkEntityTypes, existingEntities, reportSpecification } =
    params.input;

  return dedent(`
    You are a coordinating agent for a research task.
    The user provides you with a research brief, and the types of entities that are relevant.
    Your job is to do research to gather claims about those types of entities, consistent with the research brief,
    as well as relevant entities that they link to – forming a graph.
    
    You will have tools provided to you to gather claims, which will be automatically converted into entities.

    The user provides you with:
      - Prompt: the text prompt you need to satisfy to complete the research task
      ${
        reportSpecification
          ? dedent(`
      - Report Specification: the specification for the report your research will be used to produce – keep these requirements in mind when conducting research
      `)
          : ""
      }
      - Entity Types: the types of entities of interest
      ${
        linkEntityTypes
          ? dedent(`
      - Link Types: the types of links which are possible between entities
      `)
          : ""
      }
      ${
        existingEntities
          ? dedent(`
      - Existing Entities: a list of existing entities, that may contain relevant information.
      `)
          : ""
      }

    You must completely satisfy the research prompt, without any missing information.

    You must carefully examine the properties on the provided entity types and link types, because you must provide values for
      as many properties as possible.

    This may well involve:
      - inferring claims from more than one data source
      - conducting multiple searches
      - starting sub-tasks to find additional relevant claims about specific entities

    If it would be useful to split up the task into sub-tasks to find detailed information on specific entities, do so. 
    Don't start sub-tasks in parallel which duplicate or overlap, or where one will depend on the result of another (do it in sequence).
    For simpler research tasks you might not need sub-tasks.

    The "complete" tool for completing the research task will only be available once entities have been discovered.
    When declaring the job complete, you specify which of the proposed entities should be included in the final return to the user.
  `);
};

export const generateInitialUserMessage = (params: {
  input: CoordinatingAgentInput;
  questionsAndAnswers: CoordinatingAgentState["questionsAndAnswers"];
}): LlmMessageTextContent => {
  const {
    prompt,
    reportSpecification,
    entityTypes,
    linkEntityTypes,
    existingEntities,
  } = params.input;

  return {
    type: "text",
    text: dedent(`
<ResearchPrompt>${prompt}</ResearchPrompt>
${
  reportSpecification
    ? `<ReportSpecification>${reportSpecification}<ReportSpecification>`
    : ""
}
<EntityTypes>
${entityTypes
  .map((entityType) => simplifyEntityTypeForLlmConsumption({ entityType }))
  .join("\n")}
</EntityTypes>
${
  /**
   * @todo: simplify link type definitions, potentially by moving them to an "Outgoing Links" field
   * on the simplified entity type definition.
   *
   * @see https://linear.app/hash/issue/H-2826/simplify-property-values-for-llm-consumption
   */
  linkEntityTypes
    ? `<LinkTypes>${linkEntityTypes
        .map((linkType) =>
          simplifyEntityTypeForLlmConsumption({ entityType: linkType }),
        )
        .join("\n")}</LinkTypes>`
    : ""
}
${
  existingEntities
    ? `Existing Entities: ${JSON.stringify(existingEntities)}`
    : ""
}
      `),
  };
};

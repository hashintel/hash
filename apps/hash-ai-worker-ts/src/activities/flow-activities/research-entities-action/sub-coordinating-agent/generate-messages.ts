import dedent from "dedent";

import type {
  LlmMessageTextContent,
  LlmUserMessage,
} from "../../../shared/get-llm-response/llm-message.js";
import { generateOutstandingTasksDescription } from "../shared/coordinator-tools.js";
import {
  simplifyClaimForLlmConsumption,
  simplifyEntityTypeForLlmConsumption,
} from "../shared/simplify-for-llm-consumption.js";
import type { SubCoordinatingAgentInput } from "./input.js";
import type { SubCoordinatingAgentState } from "./state.js";

export const generateSystemPromptPrefix = (params: {
  input: SubCoordinatingAgentInput;
}) => {
  const { relevantEntities, existingClaimsAboutRelevantEntities } =
    params.input;

  return dedent(`
    You are a researcher tasked with discovering claims about entities to satisfy a research goal.
    You are working in a team and have been assigned a part of a wider research project.

    Your instructing colleague will provide you with
      - Goal: the research goal you need to satisfy to complete the research task
      - Entity Types: a list of entity types of the entities that you may need to discover claims about
      ${
        relevantEntities.length > 0
          ? `- Relevant Entities: a list entities which have already been discovered and may be relevant to the research goal. Check this list before making any web searches to discover entities mentioned in the research goal – they may already be provided here.`
          : ""
      }
      ${
        existingClaimsAboutRelevantEntities.length > 0
          ? `- Existing Claims About Relevant Entities: a list of claims that have already been discovered about the relevant entities`
          : ""
      }

    You are tasked with finding the claims with the provided tools to satisfy the research goal.
    
    Your colleague will also provide you with a progress report of the information discovered and work done to date.
    Take account of this when deciding your next action.

    The "complete" tool should be used once you have gathered sufficient claims to satisfy the research goal.
  `);
};

export const generateInitialUserMessage = (params: {
  input: SubCoordinatingAgentInput;
}): LlmUserMessage => {
  const {
    goal,
    relevantEntities,
    existingClaimsAboutRelevantEntities,
    entityTypes,
  } = params.input;

  return {
    role: "user",
    content: [
      {
        type: "text",
        text: dedent(`
<Goal>${goal}</Goal>
<EntityTypes>
${entityTypes
  .map((entityType) => simplifyEntityTypeForLlmConsumption({ entityType }))
  .join("\n")}
</EntityTypes>
${
  relevantEntities.length > 0
    ? `<RelevantEntities>${relevantEntities
        .map(({ localId, name, summary, entityTypeId }) => {
          const claimsAboutEntity = existingClaimsAboutRelevantEntities.filter(
            (claim) => claim.subjectEntityLocalId === localId,
          );

          return dedent(`
          <Entity>
            Name: ${name}
            Summary: ${summary}
            EntityType: ${entityTypeId}
            Claims known at start of task: ${claimsAboutEntity
              .map(
                (claim) =>
                  `<Claim>${simplifyClaimForLlmConsumption(claim)}</Claim>`,
              )
              .join("\n")}
          </Entity>`);
        })
        .join("\n")}</RelevantEntities>`
    : ""
}`),
      },
    ],
  };
};

export const generateProgressReport = (params: {
  input: SubCoordinatingAgentInput;
  state: SubCoordinatingAgentState;
}): LlmMessageTextContent => {
  const { state } = params;

  const {
    entitySummaries,
    inferredClaims,
    webQueriesMade,
    resourcesNotVisited,
    resourceUrlsVisited,
  } = state;

  let text = dedent(`
      You have previously proposed the following plan:
      ${state.plan}

      If you want to deviate from this plan or improve it, update it using the "updatePlan" tool.
      You must call the "updatePlan" tool alongside other tool calls to progress towards completing the task.
      
      You don't need to complete all the steps in the plan if you feel the claims you have already gathered are sufficient to meet the research goal – call complete if they are, with an explanation as to why they are sufficient.
    `);

  if (inferredClaims.length > 0) {
    text += dedent(`
      Here's the information about entities we've gathered so far:
      <Entities>${entitySummaries
        .map(({ localId, name, summary, entityTypeId }) => {
          const claimsAboutEntity = inferredClaims.filter(
            (claim) => claim.subjectEntityLocalId === localId,
          );

          return dedent(`<Entity>
    Name: ${name}
    Summary: ${summary}
    EntityType: ${entityTypeId}
    Claims: ${claimsAboutEntity
      .map((claim) => `<Claim>${simplifyClaimForLlmConsumption(claim)}</Claim>`)
      .join("\n")}
    </Entity>`);
        })
        .join("\n")}</Entities>
    `);
  }

  if (resourceUrlsVisited.length > 0) {
    text += dedent(`
        You have already visited the following resources – do not visit them again. They are included for your reference for work done only:
        <ResourcesVisited>
          ${resourceUrlsVisited
            .map(
              (resourceUrl) =>
                `<ResourceVisited>${resourceUrl}</ResourceVisited>`,
            )
            .join("\n")}
        </ResourcesVisited>
      `);
  }
  if (resourcesNotVisited.length > 0) {
    text += dedent(`
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
  if (webQueriesMade.length > 0) {
    text += dedent(`
        You have made the following web searches – there is no point in making these or very similar searches again:
        <WebSearchesMade>
        ${webQueriesMade.join("\n")}
        </WebSearchesMade>
      `);
  }

  text +=
    "Now decide what to do next – if you have already sufficient information to complete the task, call 'complete'.";

  text += generateOutstandingTasksDescription(state);

  return {
    type: "text",
    text,
  };
};

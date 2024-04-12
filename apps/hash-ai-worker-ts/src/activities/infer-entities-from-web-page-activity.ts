import type { GraphApi } from "@local/hash-graph-client";
import type { AccountId } from "@local/hash-subgraph";
import { StatusCode } from "@local/status";
import dedent from "dedent";

import { logger } from "../shared/logger";
import { inferEntitiesSystemMessage } from "./infer-entities/infer-entities-system-message";
import { inferEntitySummariesFromWebPage } from "./infer-entities/infer-entity-summaries-from-web-page";
import type {
  DereferencedEntityTypesByTypeId,
  InferenceState,
  WebPage,
} from "./infer-entities/inference-types";
import { proposeEntities } from "./infer-entities/propose-entities";
import type { PermittedOpenAiModel } from "./shared/openai";
import { stringify } from "./shared/stringify";

export const inferEntitiesFromWebPageActivity = async (params: {
  webPage: WebPage | string;
  relevantEntitiesPrompt?: string;
  entityTypes: DereferencedEntityTypesByTypeId;
  inferenceState: InferenceState;
  validationActorId: AccountId;
  model: PermittedOpenAiModel;
  graphApiClient: GraphApi;
  maxTokens?: number | null;
  temperature?: number;
}) => {
  const {
    webPage,
    relevantEntitiesPrompt,
    entityTypes,
    validationActorId,
    model,
    graphApiClient,
    inferenceState,
    maxTokens,
    temperature,
  } = params;

  /**
   * Inference step 1: get a list of entities that can be inferred from the input text, without property details
   *
   * The two-step approach is intended to:
   * 1. Allow for inferring more entities than completion token limits would allow for if all entity details were
   * inferred in one step
   * 2. Split the task into steps to encourage the model to infer as many entities as possible first, before filling
   * out the details
   *
   * This step may need its own internal iteration if there are very many entities to infer – to be handled inside the
   * inferEntitySummaries function.
   */

  const status = await inferEntitySummariesFromWebPage({
    webPage,
    relevantEntitiesPrompt,
    entityTypes,
    inferenceState,
    model,
    maxTokens,
    temperature,
  });

  logger.debug(
    `Inference state after entity summaries: ${stringify(inferenceState)}`,
  );

  if (status.code !== StatusCode.Ok) {
    logger.error(
      `Returning early after error inferring entity summaries: ${
        status.message ?? "no message provided"
      }`,
    );
    return status;
  }

  /**
   * Step 2: Ask the model to propose entities inferred in step 1
   *
   * The function should handle pagination internally to keep within completion token limits.
   */

  const proposeEntitiesPrompt = dedent(`
    ${typeof webPage === "string" ? "The content of the web page is as follows:" : `The website page title is ${webPage.title}, hosted at ${webPage.url}. Its content is as follows:`}
    ${typeof webPage === "string" ? webPage : webPage.textContent}
    ---WEBSITE CONTENT ENDS---

    If the content appears to include the data from a table, you must
      apply any necessary unit conversions from the table header so
      that values stored on entity properties are correct.

    Pay careful attention to the units of data, which may be defined
      in a column header, or in the table row.

    If you are asked to store a unit alongside a value in properties,
      ensure that the values is stored in the correct unit. Do not
      change units, you must use the units specified in the data.

    You already provided a summary of the ${relevantEntitiesPrompt ? "relevant entities you inferred" : "entities you can infer"} from the website. Here it is:
    ${JSON.stringify(Object.values(inferenceState.proposedEntitySummaries))}
  `);

  const promptMessages = [
    inferEntitiesSystemMessage,
    {
      role: "user",
      content: proposeEntitiesPrompt,
    } as const,
  ];

  return await proposeEntities({
    completionPayload: {
      max_tokens: maxTokens,
      messages: [
        inferEntitiesSystemMessage,
        {
          role: "user",
          content: proposeEntitiesPrompt,
        },
      ],
      model,
      temperature,
    },
    validationActorId,
    graphApiClient,
    entityTypes,
    inferenceState: {
      ...inferenceState,
      iterationCount: inferenceState.iterationCount + 1,
    },
    originalPromptMessages: promptMessages,
  });
};

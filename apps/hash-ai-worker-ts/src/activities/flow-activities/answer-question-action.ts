import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import type { AiFlowActionActivity } from "@local/hash-backend-utils/flows";
import {
  getStorageProvider,
  resolvePayloadValue,
} from "@local/hash-backend-utils/flows/payload-storage";
import { getSimpleGraph } from "@local/hash-backend-utils/simplified-graph";
import { queryEntitySubgraph } from "@local/hash-graph-sdk/entity";
import type { AiActionStepOutput } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { getSimplifiedAiFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type { FormattedText } from "@local/hash-isomorphic-utils/flows/types";
import { textFormats } from "@local/hash-isomorphic-utils/flows/types";
import {
  almostFullOntologyResolveDepths,
  currentTimeInstantTemporalAxes,
} from "@local/hash-isomorphic-utils/graph-queries";
import type { Status } from "@local/status";
import { StatusCode } from "@local/status";
import { Context } from "@temporalio/activity";
import dedent from "dedent";
import { CodeInterpreter, Sandbox } from "e2b";
import type { OpenAI } from "openai";

import { logger } from "../shared/activity-logger.js";
import { getFlowContext } from "../shared/get-flow-context.js";
import { getLlmResponse } from "../shared/get-llm-response.js";
import {
  getToolCallsFromLlmAssistantMessage,
  mapLlmMessageToOpenAiMessages,
  mapOpenAiMessagesToLlmMessages,
} from "../shared/get-llm-response/llm-message.js";
import type { LlmToolDefinition } from "../shared/get-llm-response/types.js";
import { graphApiClient } from "../shared/graph-api-client.js";
import { mapActionInputEntitiesToEntities } from "../shared/map-action-input-entities-to-entities.js";
import { openAiSeed } from "../shared/open-ai-seed.js";
import type { PermittedOpenAiModel } from "../shared/openai-client.js";
import { stringify } from "../shared/stringify.js";

const answerTools: LlmToolDefinition[] = [
  {
    name: "answer",
    description:
      "Submit the answer, or an explanation of why the question cannot be answered using the available data",
    inputSchema: {
      additionalProperties: false,
      type: "object",
      properties: {
        answer: {
          type: "object",
          additionalProperties: false,
          description: "The answer to the question, if one can be provided.",
          properties: {
            format: {
              type: "string",
              enum: [...textFormats],
              description:
                "The format of the answer 'content'. Use 'Plain' if no particular formatting is applied. Ensure all values in CSV are \"double quoted\", in case they contain the delimiter.",
            },
            content: {
              type: "string",
              description: "The content of the answer",
            },
          },
        },
        explanation: {
          type: "string",
          description:
            "A brief explanation of how the answer was reached, including any methodology, assumptions, or supporting context relied on, and why the confidence value was chosen. OR if no answer could be provided, an explanation as to why not, and what further data may help answer the question.",
        },
        confidence: {
          type: "number",
          description:
            "Confidence score of the answer, expressed as a number between 0 and 1.",
        },
      },
      required: ["explanation"],
    },
  },
  {
    name: "run_python_code",
    description:
      "Run Python code to help analyze the data. Your code should output the values you need to stdout. You should explain your reasoning for the approach taken in the 'explanation' field.",
    inputSchema: {
      additionalProperties: false,
      type: "object",
      properties: {
        code: {
          type: "string",
          description:
            "Python code to run, logging the output you need to stdout. Add comments to explain your reasoning behind function use and data access. Make sure any JSON key or table column access are copied from the context data, and are not guessed at.",
        },
        explanation: {
          type: "string",
          description: "An explanation of what the code is doing and why.",
        },
      },
      required: ["code", "explanation"],
    },
  },
];

const runPythonCode = async (code: string, contextToUpload: string | null) => {
  const sandbox = await CodeInterpreter.create();

  if (contextToUpload) {
    const requestId = Context.current().info.workflowExecution.workflowId;
    await sandbox.uploadFile(Buffer.from(contextToUpload), requestId);
  }

  const response = await sandbox.runPython(code);

  logger.debug(`Python code execution response: ${stringify(response)}`);

  const { stdout, stderr, artifacts } = response;

  const downloadedArtifacts = await Promise.all(
    artifacts.map(async (artifact) => {
      const rawArtifact = await artifact.download();
      return rawArtifact;
    }),
  );

  await sandbox.close();

  return { stdout, stderr, artifacts: downloadedArtifacts };
};

const systemPrompt = dedent(`
  You are an expert data analyst. You will be provided with data to analyze, which may be in the form of text,
  a graph of structured entities with links between them, a spreadsheet, or some combination of these.

  Your boss will ask you to answer a question based on the data provided to you. They might have asked for a specific output format,
  e.g. 'Markdown', 'JSON', or 'CSV'. If it isn't specified, you use your best judgment. Either way your response specifies the format used.

  Your boss plans to use your answer to make a decision, so you make sure that it is accurate, concise, and clear.
  If you can't provide an answer based on the available data, you explain why, and request more data if it would help.

  You write Python to analyze any context provided, if you need it. In your code, you access the context from a file using the provided path.
  Your Python code contains detailed comments about why each function is used, and how the data is accessed, including references to the shape of the context data.
  You code complete the entire task in one file.

  You provide a confidence score with your answer, which is a number between 0 and 1.
  1 represents absolute certainty, and 0 a complete guess – you never provide answers with confidence 0, but instead explain why you can't answer.
`);

type ModelResponseArgs = {
  answer?: FormattedText;
  explanation: string;
  confidence?: number;
  code?: string;
};

const maximumIterations = 10;

const model: PermittedOpenAiModel = "gpt-4o-2024-08-06";

const callModel = async (
  messages: OpenAI.ChatCompletionCreateParams["messages"],
  context: string | null,
  codeUsed: string | null,
  iteration: number,
): Promise<
  Status<{
    outputs: AiActionStepOutput<"answerQuestion">[];
  }>
> => {
  const { flowEntityId, userAuthentication, stepId, webId } =
    await getFlowContext();

  const llmResponse = await getLlmResponse(
    {
      model,
      systemPrompt,
      messages: mapOpenAiMessagesToLlmMessages({ messages }),
      temperature: 0,
      seed: openAiSeed,
      tools: answerTools,
    },
    {
      customMetadata: {
        stepId,
        taskName: "answer-question",
      },
      userAccountId: userAuthentication.actorId,
      graphApiClient,
      incurredInEntities: [{ entityId: flowEntityId }],
      webId,
    },
  );

  if (llmResponse.status !== "ok") {
    return {
      code: StatusCode.Internal,
      message: "An error occurred while calling the model.",
      contents: [],
    };
  }

  const { message } = llmResponse;

  const toolCalls = getToolCallsFromLlmAssistantMessage({ message });

  const responseMessages: OpenAI.ChatCompletionToolMessageParam[] = [];

  /**
   * Defining these outside the loop so that in cases where the maximum iteration is reached,
   * we can provide any code and explanation that was used in the last attempt.
   */
  let explanation: string | undefined;
  let code: string | undefined;

  for (const toolCall of toolCalls) {
    const parsedArguments = toolCall.input as ModelResponseArgs;

    switch (toolCall.name) {
      case "answer": {
        if (toolCalls.length > 1) {
          responseMessages.push({
            role: "tool",
            content:
              "You provided an 'answer' along with other tool calls. The 'answer' will be ignored for now, please only submit it when you have finished coding.",
            tool_call_id: toolCall.id,
          });
          continue;
        }

        const { answer, confidence } = parsedArguments;
        explanation = parsedArguments.explanation;

        const outputs: AiActionStepOutput<"answerQuestion">[] = [];
        if (answer) {
          outputs.push({
            outputName: "answer",
            payload: {
              kind: "FormattedText",
              value: answer,
            },
          });
        }
        if (codeUsed) {
          outputs.push({
            outputName: "sourceCode",
            payload: {
              kind: "Text",
              value: codeUsed,
            },
          });
        }
        if (confidence) {
          outputs.push({
            outputName: "confidence",
            payload: {
              kind: "Number",
              value: confidence,
            },
          });
        }
        outputs.push({
          outputName: "explanation",
          payload: {
            kind: "Text",
            value: explanation,
          },
        });

        return {
          code: answer ? StatusCode.Ok : StatusCode.Unknown,
          message: answer
            ? "Model successfully answered the question"
            : "Model could not answer the question",
          contents: [
            {
              outputs,
            },
          ],
        };
      }
      case "run_python_code": {
        ({ code, explanation } = parsedArguments);

        if (!code) {
          return callModel(
            [
              ...messages,
              ...mapLlmMessageToOpenAiMessages({ message }),
              {
                role: "tool",
                content: "You didn't provide any 'code' to run.",
                tool_call_id: toolCall.id,
              },
            ],
            context,
            null,
            iteration + 1,
          );
        }

        // eslint-disable-next-line no-param-reassign
        codeUsed = code;

        logger.debug(
          `Model is running code with explanation:\n\n${explanation}\n\nThe code:\n${code}\n`,
        );

        const { stdout, stderr, artifacts } = await runPythonCode(
          code,
          context,
        );

        const toolResponseMessage = stderr
          ? `The code you provided generated an error, and you now work to fix it: ${stderr}`
          : !stdout
            ? "There was no stdout from the code – you may have forgotten to print the values you require"
            : dedent(`
        The Python code ran successfully.
        The stdout from your code was: ${stdout}
        The following artifacts were generated:\n${
          // @todo: https://linear.app/hash/issue/H-3769/investigate-new-eslint-errors
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          artifacts.join("\n")
        }

        Please now review the code used and whether it correctly operates on the context data.
        If you spot errors in how the code attempts to access the code data, submit another code file with the corrections.
        If you cannot provide any answer, make sure you've tried at least two different approaches to analyzing the data, checking that the column or property keys
        you've used match those in the dataset.

        Otherwise, submit your answer.
        `);

        responseMessages.push({
          role: "tool",
          content: toolResponseMessage,
          tool_call_id: toolCall.id,
        });
      }
    }
  }

  if (iteration > maximumIterations) {
    const outputs: AiActionStepOutput<"answerQuestion">[] = [];
    if (explanation) {
      outputs.push({
        outputName: "explanation",
        payload: {
          kind: "Text",
          value: explanation,
        },
      });
    }
    if (code) {
      outputs.push({
        outputName: "sourceCode",
        payload: {
          kind: "Text",
          value: code,
        },
      });
    }

    return {
      code: StatusCode.ResourceExhausted,
      message: `Model exceeded maximum iterations ${maximumIterations}`,
      contents: [
        {
          outputs,
        },
      ],
    };
  }

  if (responseMessages.length) {
    return callModel(
      [
        ...messages,
        ...mapLlmMessageToOpenAiMessages({ message }),
        ...responseMessages,
      ],
      context,
      codeUsed,
      iteration + 1,
    );
  }

  const responseMessage: OpenAI.ChatCompletionUserMessageParam = {
    role: "user",
    content:
      "You didn't make any valid tool calls as part of your response. Please review the tools available to you and use the appropriate one.",
  };

  return callModel(
    [
      ...messages,
      ...mapLlmMessageToOpenAiMessages({ message }),
      responseMessage,
    ],
    context,
    codeUsed,
    iteration + 1,
  );
};

export const answerQuestionAction: AiFlowActionActivity<
  "answerQuestion"
> = async ({ inputs }) => {
  const {
    context,
    entities: entitiesInput,
    question,
  } = getSimplifiedAiFlowActionInputs({
    inputs,
    actionType: "answerQuestion",
  });

  const { userAuthentication } = await getFlowContext();

  // Resolve the stored ref to get the array of PersistedEntitiesMetadata
  const inputEntities = entitiesInput
    ? await resolvePayloadValue(
        getStorageProvider(),
        "PersistedEntitiesMetadata",
        entitiesInput,
      )
    : undefined;

  const entities = inputEntities
    ? await mapActionInputEntitiesToEntities({
        actorId: userAuthentication.actorId,
        graphApiClient,
        inputEntities,
      })
    : undefined;

  let contextFilePath;
  let contextToUpload;

  if (entities) {
    /**
     * We need a subgraph with the entities and their types in order to build the simple graph.
     * LLMs (at least the GPT-4 family) struggle to interpret the more complex entity objects,
     * especially writing Python code which correctly uses the base URL property keys.
     *
     * We could additionally/alternatively accept a query filter to this action,
     * rather than a list of entities, to allow for more flexibility in the data provided.
     * This will also always pull the latest version of the entities, which may differ to those passed in.
     */
    const { subgraph } = await queryEntitySubgraph(
      { graphApi: graphApiClient },
      userAuthentication,
      {
        filter: {
          any: entities.map((entity) => ({
            equal: [
              { path: ["uuid"] },
              {
                parameter: extractEntityUuidFromEntityId(
                  entity.metadata.recordId.entityId,
                ),
              },
            ],
          })),
        },
        graphResolveDepths: almostFullOntologyResolveDepths,
        traversalPaths: [
          {
            edges: [
              {
                kind: "has-left-entity",
                direction: "incoming",
              },
              {
                kind: "has-right-entity",
                direction: "outgoing",
              },
            ],
          },
          {
            edges: [
              {
                kind: "has-left-entity",
                direction: "outgoing",
              },
            ],
          },
          {
            edges: [
              {
                kind: "has-right-entity",
                direction: "outgoing",
              },
            ],
          },
        ],
        includeDrafts: true,
        temporalAxes: currentTimeInstantTemporalAxes,
        includePermissions: false,
      },
    );

    const { entities: simpleEntities, entityTypes: simpleTypes } =
      getSimpleGraph(subgraph);

    contextToUpload = JSON.stringify({
      entities: simpleEntities,
      entityTypes: simpleTypes,
    });
  } else if (context) {
    contextToUpload = context;
  }

  if (contextToUpload) {
    const requestId = Context.current().info.workflowExecution.workflowId;

    const sandbox = await Sandbox.create({ template: "base" });
    contextFilePath = await sandbox.uploadFile(
      Buffer.from(contextToUpload),
      requestId,
    );

    await sandbox.close();
  }

  const messages: OpenAI.ChatCompletionCreateParams["messages"] = [
    {
      role: "user",
      content: dedent(
        `The question your boss asks about the data: ${question}`,
      ),
    },
  ];

  if (contextToUpload && contextFilePath) {
    let message = dedent(
      `Your boss provides this context data:
      ---CONTEXT BEGINS---
      ${contextToUpload}.
      ---CONTEXT ENDS---
      This file is available at file system path ${contextFilePath} in any code you write.`,
    );

    if (entities) {
      message += `
      The context is an array containing entities, and entityTypes which describe the structure of the entities.
      Each entity has:
       * entityId: The unique id for the entity, to identify it as the target of links from other entities
       * entityType: the title of the type the entity belongs to, which are described under 'entityTypes'
       * properties: the properties of the entity
       * links: outgoing links from the entity
       * draft: whether or not this entity is in draft
       * webUuid: the uuid of the web that the entity belongs to (a namespace belonging to a user or organization)

      Bear in mind that data relating to a link between two entities may be stored as a property on the link, not the entities themselves.
      You may need to iterate through entities and its links, and the entities those links point to, to discover the data you need.
      When asked for tables or graphs, you should prefer human-readable descriptors of the entities over entityIds,
      but include entityIds as an additional column or label where possible.
      `;
    }

    messages.push({
      role: "user",
      content: message,
    });
  }

  return await callModel(messages, contextToUpload ?? null, null, 1);
};

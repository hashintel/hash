import { getSimpleGraph } from "@local/hash-backend-utils/simplified-graph";
import type { GraphApi } from "@local/hash-graph-client";
import { getSimplifiedActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type { StepOutput } from "@local/hash-isomorphic-utils/flows/types";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { mapGraphApiSubgraphToSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { EntityRootType } from "@local/hash-subgraph";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import type { Status } from "@local/status";
import { StatusCode } from "@local/status";
import { Context } from "@temporalio/activity";
import dedent from "dedent";
import { CodeInterpreter, Sandbox } from "e2b";
import type OpenAI from "openai/index";
import type { ChatCompletionToolMessageParam } from "openai/src/resources/chat/completions";

import { logger } from "../../shared/logger";
import { getOpenAiResponse } from "../shared/openai";
import { stringify } from "../shared/stringify";
import type { FlowActionActivity } from "./types";

const answerTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "answer",
      description:
        "Submit the answer, or an explanation of why the question cannot be answered using the available data",
      parameters: {
        type: "object",
        properties: {
          answer: {
            type: "string",
            description: "The answer to the question, if one can be provided.",
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
  },
  {
    type: "function",
    function: {
      name: "run_python_code",
      description:
        "Run Python code to help analyze the data. Your code should output the values you need to stdout. You should explain your reasoning for the approach taken in the 'explanation' field.",
      parameters: {
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
  e.g. 'Markdown', 'JSON', or 'CSV'. If it isn't specified, you use your best judgment.
  
  Your boss plans to use your answer to make a decision, so you make sure that it is accurate, concise, and clear.
  If you can''t provide an answer based on the available data, you explain why, and request more data if it would help.
  
  You write Python to analyze any context provided, if you need it. In your code, you access the context from a file using the provided path.
  Your Python code contains detailed comments about why each function is used, and how the data is accessed, including references to the shape of the context data.
  You code complete the entire task in one file.
  
  You provide a confidence score with your answer, which is a number between 0 and 1. 
  1 represents absolute certainty, and 0 a complete guess – you never provide answers with confidence 0, but instead explain why you can't answer.
`);

type ModelResponseArgs = {
  answer?: string;
  explanation: string;
  confidence?: number;
  code?: string;
};

const callModel = async (
  messages: OpenAI.ChatCompletionCreateParams["messages"],
  context: string | null,
  codeUsed: string | null,
): Promise<
  Status<{
    outputs: StepOutput[];
  }>
> => {
  const openApiPayload: OpenAI.ChatCompletionCreateParams = {
    model: "gpt-4-turbo-preview",
    messages,
    stream: false,
    temperature: 0,
    tools: answerTools,
  };

  const openAiResponse = await getOpenAiResponse(openApiPayload);

  logger.debug(`Open AI Response received: ${stringify(openAiResponse)}`);

  const { response } = openAiResponse.contents[0]!;

  const { message: modelResponseMessage } = response;

  const toolCalls = modelResponseMessage.tool_calls;

  if (!toolCalls?.length) {
    return {
      code: StatusCode.Internal,
      message: "No tool call found in response",
      contents: [],
    };
  }

  const responseMessages: ChatCompletionToolMessageParam[] = [];

  for (const toolCall of toolCalls) {
    let parsedArguments: ModelResponseArgs;
    try {
      parsedArguments = JSON.parse(
        toolCall.function.arguments,
      ) as ModelResponseArgs;
    } catch (err) {
      return callModel(
        [
          ...messages,
          modelResponseMessage,
          {
            role: "tool",
            content: `Your JSON arguments could not be parsed – the parsing function errored: ${
              (err as Error).message
            }. Please try again.`,
            tool_call_id: toolCall.id,
          },
        ],
        context,
        null,
      );
    }

    switch (toolCall.function.name) {
      case "answer": {
        if (toolCalls.length > 1) {
          responseMessages.push({
            role: "tool",
            content:
              "You provided an 'answer' along with other tool calls. The 'answer' will be ignored for now, please only submit it when you have finished coding.",
            tool_call_id: toolCall.id,
          });
        }

        const { answer, explanation, confidence } = parsedArguments;

        const outputs: StepOutput[] = [];
        if (answer) {
          outputs.push({
            outputName: "answer",
            payload: {
              kind: "Text",
              value: answer,
            },
          });
        }
        if (codeUsed) {
          outputs.push({
            outputName: "code",
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
          code: StatusCode.Ok,
          contents: [
            {
              outputs,
            },
          ],
        };
      }
      case "run_python_code": {
        const { code, explanation } = parsedArguments;

        if (!code) {
          return callModel(
            [
              ...messages,
              modelResponseMessage,
              {
                role: "tool",
                content: "You didn't provide any 'code' to run.",
                tool_call_id: toolCall.id,
              },
            ],
            context,
            null,
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
        The following artifacts were generated:\n${artifacts.join("\n")}
        
        Please now review the code used and whether it correctly operates on the context data.
        If you spot errors in how the code attempts to access the code data, submit another code block with the corrections.
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

  if (responseMessages.length) {
    return callModel(
      [...messages, modelResponseMessage, ...responseMessages],
      context,
      codeUsed,
    );
  }

  return {
    code: StatusCode.Internal,
    message: "No valid tool call found in response",
    contents: [],
  };
};

export const answerQuestionAction: FlowActionActivity<{
  graphApiClient: GraphApi;
}> = async ({ graphApiClient, inputs, userAuthentication }) => {
  const { context, entities, question } = getSimplifiedActionInputs({
    inputs,
    actionType: "answerQuestion",
  });

  let contextFilePath;
  let contextToUpload;
  if (entities) {
    const subgraph = await graphApiClient
      .getEntitiesByQuery(userAuthentication.actorId, {
        query: {
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
          graphResolveDepths: {
            ...zeroedGraphResolveDepths,
            constrainsValuesOn: { outgoing: 255 },
            constrainsPropertiesOn: { outgoing: 255 },
            constrainsLinksOn: { outgoing: 1 },
            constrainsLinkDestinationsOn: { outgoing: 1 },
            inheritsFrom: { outgoing: 255 },
            isOfType: { outgoing: 1 },
            hasLeftEntity: { outgoing: 1, incoming: 1 },
            hasRightEntity: { outgoing: 1, incoming: 1 },
          },
          includeDrafts: true,
          temporalAxes: currentTimeInstantTemporalAxes,
        },
      })
      .then(({ data }) =>
        mapGraphApiSubgraphToSubgraph<EntityRootType>(
          data.subgraph,
          userAuthentication.actorId,
        ),
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
      role: "system",
      content: systemPrompt,
    },
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

  return await callModel(messages, contextToUpload ?? null, null);
};

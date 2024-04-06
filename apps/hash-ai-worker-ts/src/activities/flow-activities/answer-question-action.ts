import { getSimplifiedActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type { StepOutput } from "@local/hash-isomorphic-utils/flows/types";
import type { Status } from "@local/status";
import { StatusCode } from "@local/status";
import { Context } from "@temporalio/activity";
import dedent from "dedent";
import { CodeInterpreter, Sandbox } from "e2b";
import type OpenAI from "openai/index";
import type { ChatCompletionToolMessageParam } from "openai/src/resources/chat/completions";

import { getOpenAiResponse } from "../shared/openai";
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
        "Run Python code to help analyze the data. Your code should output the values you need to stdout.",
      parameters: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description:
              "Python code to run, logging the output you need to stdout.",
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

const runPythonCode = async (code: string, contextToUpload?: string) => {
  const sandbox = await CodeInterpreter.create();

  if (contextToUpload) {
    const requestId = Context.current().info.workflowExecution.workflowId;
    await sandbox.uploadFile(Buffer.from(contextToUpload), requestId);
  }

  const response = await sandbox.runPython(code);

  console.log(JSON.stringify(response, undefined, 2));

  const { stdout, stderr, artifacts } = response;

  const downloadedArtifacts = await Promise.all(
    artifacts.map(async (artifact) => {
      const rawArtifact = await artifact.download();
      console.log("Artifact type", typeof rawArtifact);
      return rawArtifact;
    }),
  );

  await sandbox.close();

  return { stdout, stderr, artifacts: downloadedArtifacts };
};

const systemPrompt = dedent(`
  You are an expert data analyst. You were provided with data to analyze, which may be in the form of text,
  a graph of structured entities with links between them, a spreadsheet, or some combination of these.
  
  Your boss has asked you to answer a question based on the data provided to you. They might have asked for a specific output format,
  e.g. 'Markdown', 'JSON', or 'CSV'. If none is specified, you used your best judgment.
  
  Your boss is going to use your answer to make a decision, so you made sure that it is accurate, concise, and clear.
  If you couldn't provide an answer based on the available data, you explained why, and requested more data if it would help.
  
  You write Python to analyze any context provided, if you need it. In your code, you access the context from a file using the provided path.
  
  You provided a confidence score with your answer, which is a number between 0 and 1. 
  1 represents absolute certainty, and 0 a complete guess – you never provide answers with confidence 0, but instead explain why you can't answer.
`);

const callModel = async (
  messages: OpenAI.ChatCompletionCreateParams["messages"],
  context?: string,
  codeUsed?: string,
): Promise<
  Status<{
    outputs: StepOutput[];
  }>
> => {
  const openApiPayload: OpenAI.ChatCompletionCreateParams = {
    model: "gpt-4",
    messages,
    stream: false,
    tools: answerTools,
  };

  const openAiResponse = await getOpenAiResponse(openApiPayload);

  console.log(
    "Open AI Response received: ",
    JSON.stringify(openAiResponse, undefined, 2),
  );

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
    const parsedArguments = JSON.parse(toolCall.function.arguments) as {
      answer?: string;
      explanation: string;
      confidence?: number;
      code?: string;
    };

    switch (toolCall.function.name) {
      case "answer": {
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
                role: "user",
                content: "You didn't provide any 'code' to run.",
              },
            ],
            context,
          );
        }

        console.log(
          `Model is running code with explanation:\n\n${explanation}\n\nThe code:\n${code}\n`,
        );

        const { stdout, stderr, artifacts } = await runPythonCode(
          code,
          context,
        );

        console.log({ stdout, stderr, artifacts });

        const toolResponseMessage = stderr
          ? `The code you provided generated an error, and you worked to fix it: ${stderr}`
          : !stdout
          ? "There was no stdout from the code – you may have forgotten to print the values you require"
          : dedent(`
        The Python code ran successfully, and you now used it to provide an answer.
        The stdout from your code was: ${stdout}
        The following artifacts were generated:\n${artifacts.join("\n")}
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

export const answerQuestionAction: FlowActionActivity = async ({ inputs }) => {
  const { context, entities, question } = getSimplifiedActionInputs({
    inputs,
    actionType: "answerQuestion",
  });

  let contextFilePath;
  const contextToUpload = entities ? JSON.stringify(entities) : context;
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
      content: dedent(`The question the user asked: ${question}`),
    },
  ];

  if (contextToUpload && contextFilePath) {
    let message = `The user provided this context data: ${context}. This file is available at file system path ${contextFilePath} in any code you write.`;

    if (entities) {
      message += `The context is an array of entities. 
      Entities have properties, and may have a 'linkData' object that contains links to other entities, where the leftEntityId is the source of the link,
      and the rightEntityId is the target of the link – these refer to the metadata.recordId.entityId of other entities. 
      Non-link entities and link entities together form a graph of entities.
      If asked a question which relies on the value of some property, you considered the properties and types of the provided properties and links,
      making sure to write code (if required) that accesses the correct properties which are present in the data.
      Bear in mind that data relating to a link between two entities may be stored as a property on the link, not the entities themselves.
      Pay close attention to the keys in the JSON – don't guess, use the context provided.
      `;
    }

    messages.push({
      role: "user",
      content: message,
    });
  }

  return await callModel(messages, contextToUpload);
};

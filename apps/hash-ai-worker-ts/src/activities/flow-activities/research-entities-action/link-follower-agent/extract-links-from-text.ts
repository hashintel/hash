import type { WebPage } from "@local/hash-isomorphic-utils/flows/types";
import dedent from "dedent";

import { getFlowContext } from "../../../shared/get-flow-context";
import { getLlmResponse } from "../../../shared/get-llm-response";
import { getToolCallsFromLlmAssistantMessage } from "../../../shared/get-llm-response/llm-message";
import type {
  LlmParams,
  LlmToolDefinition,
} from "../../../shared/get-llm-response/types";
import { graphApiClient } from "../../../shared/graph-api-client";

export type Link = {
  url: string;
  description: string;
};

const defaultModel: LlmParams["model"] = "claude-3-haiku-20240307";

export const extractLinksFromTextSystemPrompt = dedent(`
  You are a link extractor agent.

  The user will provide you with:
    - prompt: a description of the task the user is trying to accomplish, which may be solved by exploring certain links in the provided text
    - text: a piece of content that may contain relevant links

  A link is a URL for a website, usually starting with "http://" or "https://".

  Treat URLs with query parameters as separate links. For example, treat "https://example.com/page?query=1" as a separate link from "https://example.com/page".

  The text may be in a variety of formats (e.g. HTML, markdown, plain text, etc.).

  You must return any link which may contain relevant information.

  Pay attention to paginated data, and ensure you extract links for all linked pages individually.
`);

const submitLinksTool: LlmToolDefinition<"submitLinks"> = {
  name: "submitLinks",
  description: "Submit the relevant links from the text",
  inputSchema: {
    type: "object",
    properties: {
      links: {
        type: "array",
        items: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: dedent(`
                The URL of the link, which must start with 'http://' or 'https://', or if it's a relative URL start with '/'.
                You must include any specified query parameters in the URL.
              `),
            },
            reason: {
              type: "string",
              description: dedent(`
                A description of why the link is relevant to the prompt.
                Describe how the link can be used to satisfy the prompt, or why it is important to explore the link.
              `),
            },
            description: {
              type: "string",
              description: dedent(`
                A description of the link, and the context in which it was found in the text.
                Describe what information might be found at the link, if it is mentioned in the text or can be otherwise inferred.
              `),
            },
          },
          required: ["url", "description"],
        },
      },
    },
    required: ["links"],
  },
};

export const extractLinksFromText = async (params: {
  content: WebPage;
  prompt: string;
  testingParams?: {
    model?: LlmParams["model"];
    systemPrompt?: string;
  };
}) => {
  const { content, prompt, testingParams } = params;

  const { userAuthentication, webId } = await getFlowContext();

  const text = content.htmlContent;

  const response = await getLlmResponse(
    {
      systemPrompt:
        testingParams?.systemPrompt ?? extractLinksFromTextSystemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: dedent(`
                Prompt: ${prompt}
                Text: ${text}
              `),
            },
          ],
        },
      ],
      model: testingParams?.model ?? defaultModel,
      toolChoice: "submitLinks",
      tools: [submitLinksTool],
    },
    {
      userAccountId: userAuthentication.actorId,
      graphApiClient,
      webId,
      incurredInEntities: [],
    },
  );

  if (response.status === "ok") {
    const { message } = response;
    const toolCalls = getToolCallsFromLlmAssistantMessage({ message });

    const baseUrl = new URL(content.url).origin;

    const links = toolCalls.reduce<Link[]>((acc, toolCall) => {
      const { links: inputLinks } = toolCall.input as { links: Link[] };

      return [
        ...acc,
        ...inputLinks.map(({ url, description }) => ({
          url: url.startsWith("/") ? `${baseUrl}${url}` : url,
          description,
        })),
      ];
    }, []);

    return { status: "ok" as const, links };
  }

  return response;
};

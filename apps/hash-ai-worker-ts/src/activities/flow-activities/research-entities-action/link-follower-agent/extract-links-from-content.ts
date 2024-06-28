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

const defaultModel: LlmParams["model"] = "claude-3-5-sonnet-20240620";

export const extractLinksFromContentSystemPrompt = dedent(`
  You are a comprehensive link extractor agent.

  The user will provide you with:
  - prompt: a description of the task the user is trying to accomplish, which may be solved by exploring certain links in the provided text  
  - text: a piece of content that may contain relevant links

  A link is a URL for a website, usually starting with "http://" or "https://". Make sure to extract the full URL, including any query parameters.

  Treat URLs with different query parameters as separate links. For example, treat "https://example.com/page?query=1" as a separate link from "https://example.com/page?query=2". 

  The text may be in a variety of formats (e.g. HTML, markdown, plain text, etc.).

  Your job is to extract ALL links from the provided text that may contain information relevant to accomplishing the user's specified task. Be EXTREMELY comprehensive to ensure NO relevant link is missed. This includes:

  1. Paginated data: If the text contains paginated data spread across multiple pages, you MUST extract the links to EVERY SINGLE relevant paginated page individually, no matter how many pages there are. Do not skip a single page, even if there are hundreds or thousands of pages. Missing even one paginated page could mean missing crucial information to solve the user's task. Systematically follow ALL pagination links exhaustively, clicking "Next" or other similar links, until you reach the very last page. Do not stop until there are no more "Next" links.

  2. Links to documents: Pay extremely close attention to any links pointing to documents like PDFs, Excel files, Word files, CSV files etc. These document links often contain the most important and detailed information needed to solve the user's task. Prioritize extracting these document links. Carefully scan the full text multiple times to ensure you don't miss a single link to a relevant document.  

  3. Links described in text: Sometimes the text may describe links without rendering them as actual hyperlinks. Do not miss these - e.g. if the text says something like "The full report can be accessed at www.example.com/report", make sure to extract "https://www.example.com/report" as the full URL.

  Return the complete list of extracted links, being as exhaustive and comprehensive as possible. The goal is to enable the user to access ALL the information they may need to fully accomplish their task, so your link extraction must be extremely thorough and miss nothing of potential relevance. 

  If there is even a small chance a link is relevant, include it. It is far better to include too many links than too few. Comb through the entire provided text multiple times to be absolutely certain you have found every last relevant link. Leave no stone unturned in your search for links.
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
          required: ["url", "description", "reason"],
        },
      },
    },
    required: ["links"],
  },
};

export const extractLinksFromContent = async (params: {
  contentUrl: string;
  content: string;
  prompt: string;
  testingParams?: {
    model?: LlmParams["model"];
    systemPrompt?: string;
  };
}) => {
  const { content, contentUrl, prompt, testingParams } = params;

  const { userAuthentication, webId, flowEntityId, stepId } =
    await getFlowContext();

  const response = await getLlmResponse(
    {
      systemPrompt:
        testingParams?.systemPrompt ?? extractLinksFromContentSystemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: dedent(`
                Prompt: ${prompt}
                Text: ${content}
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
      incurredInEntities: [{ entityId: flowEntityId }],
      customMetadata: { taskName: "extract-links-from-content", stepId },
    },
  );

  if (response.status === "ok") {
    const { message } = response;
    const toolCalls = getToolCallsFromLlmAssistantMessage({ message });

    const baseUrl = new URL(contentUrl).origin;

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

import dedent from "dedent";
import { JSDOM } from "jsdom";

import { getFlowContext } from "../../../shared/get-flow-context.js";
import { getLlmResponse } from "../../../shared/get-llm-response.js";
import { getToolCallsFromLlmAssistantMessage } from "../../../shared/get-llm-response/llm-message.js";
import type {
  LlmParams,
  LlmToolDefinition,
} from "../../../shared/get-llm-response/types.js";
import { graphApiClient } from "../../../shared/graph-api-client.js";
import { stripHashFromUrl } from "../shared/are-urls-equal.js";

export type Link = {
  url: string;
  description: string;
};

const defaultModel: LlmParams["model"] = "claude-haiku-4-5-20251001";

export const chooseRelevantLinksFromContentSystemPrompt = dedent(`
You are an exceptionally thorough and meticulous link choosing agent.

The user will provide you with:
- prompt: a description of the task the user is trying to accomplish, which may be solved by exploring certain links in the provided text
- text: a piece of content that may contain relevant links

A link is a URL for a website, usually starting with "http://" or "https://". Extract the full URL, including all query parameters.

Treat URLs with different query parameters as separate links. For example, "https://example.com/page?query=1" and "https://example.com/page?query=2" are distinct links.

The text may be in various formats (e.g., HTML, markdown, plain text, etc.).

Your primary mission is to extract EVERY SINGLE link from the provided text that could potentially contain information relevant to accomplishing the user's specified task. Your extraction process must be EXTREMELY comprehensive and HYPER-VIGILANT to ensure that NOT A SINGLE relevant link is overlooked. This includes:

1. Paginated data: If the text contains paginated data across multiple pages, you MUST extract the links to EACH AND EVERY relevant paginated page individually, regardless of the number of pages. Do not skip any page, even if there are hundreds or thousands. Missing even one paginated page could result in crucial information loss. Systematically and meticulously follow ALL pagination links, including "Next", "Previous", numbered pages, and any other pagination indicators. Continue until you've reached the absolute last page, ensuring you've captured every single page in the sequence.

2. Document links: Pay EXTRA SPECIAL attention to any links pointing to documents such as PDFs, Excel files, Word documents, CSV files, etc. These document links often contain the most critical and detailed information needed to solve the user's task. Prioritize and double-check the extraction of these document links. Scan the full text multiple times, using different techniques each time, to ensure you don't miss a single link to a relevant document.

3. Text-embedded links: Be extremely vigilant about links described within the text without being rendered as actual hyperlinks. For instance, if the text mentions "For more information, visit www.example.com/details", make sure to extract "https://www.example.com/details" as a full URL.

4. Partial links and URL construction: If you encounter partial links or references that could be constructed into full URLs, do so. For example, if you see a relative path like "/report/2023", construct the full URL based on the context or domain information provided.

5. Encoded or obfuscated links: Be on high alert for links that may be encoded, obfuscated, or represented in non-standard formats. This could include JavaScript-based links, data URIs, or links using unconventional protocols.

Return an exhaustive and comprehensive list of all extracted links. The goal is to provide the user with ACCESS TO EVERY PIECE OF INFORMATION they might possibly need to fully accomplish their task. Your link extraction must be extremely thorough, leaving absolutely nothing of potential relevance uncaptured.

If there is even the slightest possibility that a link could be relevant, include it without hesitation. It is ALWAYS preferable to include too many links rather than too few. Scrutinize the entire provided text multiple times, using different analytical approaches each time, to be absolutely certain you have uncovered every last relevant link. Leave no stone unturned, no text unexamined, and no potential link unconsidered in your relentless search for relevant information.

After your initial extraction, take a moment to review your findings. Ask yourself: "Have I truly captured every possible relevant link? Is there any stone left unturned?" Only when you are 100% confident in the completeness of your extraction should you provide your final list of links.
`);

const submitLinksTool: LlmToolDefinition<"submitLinks"> = {
  name: "submitLinks",
  description: "Submit the relevant links from the text",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      links: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
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

const extractLinksFromHtml = (html: string) => {
  const dom = new JSDOM(html);
  const { document } = dom.window;
  const links = document.getElementsByTagName("a");

  const linkUrlSet = new Set<string>();

  let linksList = "";
  for (const link of links) {
    /**
     * If the URL is the same except for a fragment, we consider them the same link.
     * This would change if we started chunking URLs by their fragments,
     * or if webpages changed their content based on the fragment.
     */
    const href = stripHashFromUrl(link.href);

    if (linkUrlSet.has(href)) {
      continue;
    }

    linkUrlSet.add(href);

    linksList += `${
      link.innerText ? `<LinkText>${link.innerText}</LinkText>` : ""
    }<LinkUrl>${href}</LinkUrl>\n`;
  }

  return linksList;
};

export const chooseRelevantLinksFromContent = async (params: {
  contentUrl: string;
  content: string;
  contentType: "html" | "text";
  goal: string;
  testingParams?: {
    model?: LlmParams["model"];
    systemPrompt?: string;
  };
}) => {
  const {
    content: unfilteredContent,
    contentUrl,
    contentType,
    goal,
    testingParams,
  } = params;

  const { userAuthentication, webId, flowEntityId, stepId } =
    await getFlowContext();

  const content =
    contentType === "text"
      ? unfilteredContent
      : extractLinksFromHtml(unfilteredContent);

  const response = await getLlmResponse(
    {
      systemPrompt:
        testingParams?.systemPrompt ??
        chooseRelevantLinksFromContentSystemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: dedent(`
                <Prompt>Please provide links relevant to this goal: ${goal}</Prompt>
                <Content>${content}</Content>
                <ExampleResponse>
                  {
                    "links": [
                      {
                        "url": "https://arxiv.org/abs/2405.10674",
                        "description": "The main abstract page for the paper, which likely contains the author names and affiliations.",
                        "reason": "This is the primary page for the paper, which should have the author information needed to satisfy the prompt."
                      }
                    ]
                  }
                </ExampleResponse>
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

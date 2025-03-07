#!/usr/bin/env node

import { LinearClient } from "@linear/sdk";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { config } from "dotenv-flow";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { hydrateIssue } from "./main/populate-linear-resources.js";

config({ path: "../../../.env.local", silent: true });

if (!process.env.MCP_LINEAR_API_KEY) {
  throw new Error("MCP_LINEAR_API_KEY is not set");
}

const linear = new LinearClient({
  apiKey: process.env.MCP_LINEAR_API_KEY,
});

const GetIssueRequestSchema = z.object({
  issueId: z.string({ description: "The id of the issue to retrieve" }),
});

const AddCommentToIssueRequestSchema = z.object({
  issueId: z.string({ description: "The id of the issue to add a comment to" }),
  parentId: z
    .string({
      description: "The id of the comment to reply to, if any.",
    })
    .optional(),
  comment: z.string({
    description: "The text of the comment to add.",
  }),
  userId: z.string({
    description:
      "The id of the user to draw the comment's attention to. This should be the assignee, unless you are replying to a comment from another user.",
  }),
  userTag: z.string({
    description:
      "The tag of the user to draw the comment's attention to. This should be the assignee, unless you are replying to a comment from another user.",
  }),
});

const tools = [
  {
    name: "list_issues",
    description: "List all issues in the current sprint",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_issue",
    description: "Get an issue from Linear",
    inputSchema: zodToJsonSchema(GetIssueRequestSchema),
  },
  {
    name: "add_comment_to_issue",
    description: "Add a comment to an issue",
    inputSchema: zodToJsonSchema(AddCommentToIssueRequestSchema),
  },
] as const;

type ToolName = (typeof tools)[number]["name"];

const server = new Server(
  {
    name: "linear-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
      prompts: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, () => {
  return {
    tools,
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const typedName = request.params.name as ToolName;

  switch (typedName) {
    case "list_issues": {
      const issues = await linear.issues({
        filter: {
          cycle: {
            isActive: {
              eq: true,
            },
          },
        },
      });

      const hydratedIssues = await Promise.all(
        issues.nodes.map(async (issue) =>
          hydrateIssue({ issue, includeComments: false }),
        ),
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(hydratedIssues, null, 2),
          },
        ],
      };
    }

    case "get_issue": {
      const args = GetIssueRequestSchema.parse(request.params.arguments);

      const issue = await linear.issue(args.issueId);

      const hydratedIssue = await hydrateIssue({
        issue,
        includeComments: true,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(hydratedIssue, null, 2),
          },
        ],
      };
    }

    case "add_comment_to_issue": {
      const args = AddCommentToIssueRequestSchema.parse(
        request.params.arguments,
      );

      await linear.createComment({
        bodyData: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "suggestion_userMentions",
                  attrs: {
                    label: args.userTag,
                    id: args.userId,
                  },
                },
                {
                  type: "text",
                  text: ` ${args.comment}`,
                },
              ],
            },
          ],
        },
        parentId: args.parentId,
        issueId: args.issueId,
      });

      return {
        content: [{ type: "text", text: "Comment added successfully." }],
      };
    }

    default:
      throw new Error("Unknown tool");
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // eslint-disable-next-line no-console
  console.error("Server started");
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Server error:", error);
  process.exit(1);
});

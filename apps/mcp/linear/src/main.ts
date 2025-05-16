#!/usr/bin/env node

import { LinearClient } from "@linear/sdk";
import { hydrateLinearIssue } from "@local/hash-backend-utils/linear";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { config } from "dotenv-flow";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

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

const CreateIssueRequestSchema = z.object({
  title: z.string({ description: "The title of the issue to create" }),
  assigneeId: z
    .string({
      description:
        "The id of the user to assign the issue to. If the parent issue has an assignee, this MUST be the same as the parent issue's assignee.",
    })
    .optional(),
  teamId: z.string({
    description:
      "The id of the team to assign the issue to (MUST be the same as the parent issue).",
  }),
  description: z.string({
    description:
      "The description of the issue to create. MUST be formatted as a ProseMirror document. Use checklists for todo items.",
  }),
  parentIssueUuid: z
    .string({
      description:
        "The uuid of the parent issue this is a sub-issue of (not the H-XXXX format).",
    })
    .optional(),
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
  {
    name: "create_issue",
    description: "Create a new issue in Linear",
    inputSchema: zodToJsonSchema(CreateIssueRequestSchema),
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
          hydrateLinearIssue({ issue, includeComments: false }),
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

      const hydratedIssue = await hydrateLinearIssue({
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

    case "create_issue": {
      const args = CreateIssueRequestSchema.parse(request.params.arguments);

      const issueCreateInput = {
        assigneeId: args.assigneeId,
        description: args.description,
        parentId: args.parentIssueUuid,
        teamId: args.teamId,
        title: args.title,
      };

      const issue = await linear.createIssue(issueCreateInput);

      if (!issue.success || !issue.issue) {
        throw new Error("Failed to create issue");
      }

      const createdIssue = await linear.issue((await issue.issue).id);
      const hydratedIssue = await hydrateLinearIssue({
        issue: createdIssue,
        includeComments: false,
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

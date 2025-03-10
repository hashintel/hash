#!/usr/bin/env node

import { Anthropic } from "@anthropic-ai/sdk";
import { LinearClient } from "@linear/sdk";
import chalk from "chalk";
import { config } from "dotenv-flow";
import execa from "execa";
import { z } from "zod";

config({ path: "../../../../.env.local", silent: true });

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

type DiffComment = {
  comment: string;
  filePath: string;
  lineNumber: number;
};

type TodoItem = {
  description: string;
  ticketId: string;
};

type PRReview = {
  diffComments: DiffComment[];
  todos: TodoItem[] | null;
  generalReview: {
    text: string;
    decision: "comment" | "request-changes";
  };
};

type LinearTicket = {
  id: string;
  title: string;
  description?: string;
  state?: string;
  assignee?: unknown;
};

// Zod schemas for validating responses
const DiffCommentSchema = z.object({
  comment: z.string(),
  filePath: z.string(),
  lineNumber: z.number().int().positive(),
});

const TodoItemSchema = z.object({
  description: z.string(),
  ticketId: z.string().regex(/^H-\d+$/, "Must be in format H-XXXX"),
});

const PRReviewSchema = z.object({
  diffComments: z.array(DiffCommentSchema),
  todos: z.array(TodoItemSchema).nullable(),
  generalReview: z.object({
    text: z.string(),
    decision: z.enum(["comment", "request-changes"]),
  }),
});

const LinearTicketIdsSchema = z.array(
  z.string().regex(/^H-\d+$/, "Must be in format H-XXXX"),
);

const getPRDetails = async (prNumber: string): Promise<string> => {
  try {
    const { stdout } = await execa("gh", [
      "pr",
      "view",
      prNumber,
      "--comments",
    ]);
    return stdout;
  } catch (error) {
    console.error(
      chalk.red(`Error fetching PR details: ${stringifyError(error)}`),
    );
    process.exit(1);
  }
};

const getPRDiff = async (prNumber: string): Promise<string> => {
  try {
    const { stdout } = await execa("gh", ["pr", "diff", prNumber]);
    return stdout;
  } catch (error) {
    console.error(
      chalk.red(`Error fetching PR diff: ${stringifyError(error)}`),
    );
    process.exit(1);
  }
};

const extractLinearTicketIds = async (prDetails: string): Promise<string[]> => {
  try {
    // Define the tool for extracting Linear ticket IDs
    const extractTicketIdsTool = {
      name: "extract_linear_ticket_ids",
      description:
        "Extract all Linear ticket IDs (in the format H-XXXX where XXXX is a number) from the PR details. Return only valid Linear ticket IDs that follow the H-XXXX format.",
      input_schema: {
        type: "object" as const,
        properties: {
          prDetails: {
            type: "string",
            description:
              "The PR details text to extract Linear ticket IDs from",
          },
        },
        required: ["prDetails"],
      },
    };

    const response = await anthropic.messages.create({
      model: "claude-3-7-sonnet-20240307",
      max_tokens: 1000,
      tools: [extractTicketIdsTool],
      tool_choice: { type: "tool", name: "extract_linear_ticket_ids" },
      messages: [
        {
          role: "user",
          content:
            "Extract all Linear ticket IDs from the following PR details. Only return valid Linear ticket IDs in the format H-XXXX where XXXX is a number.",
        },
      ],
    });

    // Check if Claude used the tool
    const toolUseBlock = response.content.find(
      (block) => block.type === "tool_use",
    );

    if (toolUseBlock) {
      // Send the tool result back to Claude
      const toolResult = await anthropic.messages.create({
        model: "claude-3-7-sonnet-20240307",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content:
              "Extract all Linear ticket IDs from the following PR details. Only return valid Linear ticket IDs in the format H-XXXX where XXXX is a number.",
          },
          {
            role: "assistant",
            content: [toolUseBlock],
          },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: toolUseBlock.id,
                content: JSON.stringify(
                  LinearTicketIdsSchema.parse(prDetails.match(/H-\d+/g) ?? []),
                ),
              },
            ],
          },
        ],
      });

      // Parse the final response
      const textBlock = toolResult.content.find(
        (block) => block.type === "text",
      );
      if (textBlock?.type === "text") {
        const matches = textBlock.text.match(/H-\d+/g);
        if (matches) {
          return LinearTicketIdsSchema.parse(matches);
        }
      }
    }

    // Fallback: direct regex extraction if tool use fails
    const matches = prDetails.match(/H-\d+/g);
    return matches ? LinearTicketIdsSchema.parse(matches) : [];
  } catch (error) {
    console.error(
      chalk.red(`Error parsing Linear ticket IDs: ${stringifyError(error)}`),
    );
    return [];
  }
};

const fetchLinearTickets = async (
  ticketIds: string[],
): Promise<LinearTicket[]> => {
  if (!process.env.LINEAR_API_KEY) {
    console.log(
      chalk.yellow("LINEAR_API_KEY not set, skipping Linear ticket fetching"),
    );
    return [];
  }

  const linear = new LinearClient({
    apiKey: process.env.LINEAR_API_KEY,
  });

  const tickets: LinearTicket[] = [];
  for (const id of ticketIds) {
    try {
      const issue = await linear.issue(id);
      const hydratedIssue: LinearTicket = {
        id: issue.identifier,
        title: issue.title,
        description: issue.description,
        state: (await issue.state)?.name,
        assignee: await issue.assignee,
      };
      tickets.push(hydratedIssue);
    } catch (error) {
      console.error(
        chalk.yellow(
          `Error fetching Linear ticket ${id}: ${stringifyError(error)}`,
        ),
      );
    }
  }

  return tickets;
};

const generateAIReview = async (
  prDetails: string,
  prDiff: string,
  linearTickets: LinearTicket[],
): Promise<PRReview> => {
  // Define the tool for generating PR reviews
  const generateReviewTool = {
    name: "generate_pr_review",
    description:
      "Generate a comprehensive code review for a pull request. The review should include specific comments on parts of the diff, follow-up tasks if needed, and a general review with a decision to either comment or request changes.",
    input_schema: {
      type: "object" as const,
      properties: {
        prDetails: {
          type: "string",
          description:
            "The PR details including title, description, and comments",
        },
        prDiff: {
          type: "string",
          description: "The diff of the PR showing code changes",
        },
        linearTickets: {
          type: "array",
          description: "Information about related Linear tickets",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              description: { type: "string" },
              state: { type: "string" },
              assignee: { type: "object" },
            },
          },
        },
      },
      required: ["prDetails", "prDiff"],
    },
  };

  const ticketsInfo =
    linearTickets.length > 0
      ? `Linear tickets related to this PR:\n${JSON.stringify(
          linearTickets,
          null,
          2,
        )}`
      : "No Linear tickets found for this PR.";

  try {
    // First message to request the review
    const response = await anthropic.messages.create({
      model: "claude-3-7-sonnet-20240307",
      max_tokens: 4000,
      tools: [generateReviewTool],
      tool_choice: { type: "tool", name: "generate_pr_review" },
      messages: [
        {
          role: "user",
          content: `I need a comprehensive review of a pull request. Please analyze the code changes and provide specific comments, follow-up tasks, and a general review with a decision.

The review should follow a specific structure with:
1. Comments on specific parts of the diff (file path, line number, and comment text)
2. TODO items for follow-up work (if any)
3. General review comments and a decision (comment or request changes)

${ticketsInfo}`,
        },
      ],
    });

    // Check if Claude used the tool
    const toolUseBlock = response.content.find(
      (block) => block.type === "tool_use",
    );

    if (toolUseBlock) {
      // Send the tool result back to Claude
      const toolResult = await anthropic.messages.create({
        model: "claude-3-7-sonnet-20240307",
        max_tokens: 4000,
        messages: [
          {
            role: "user",
            content: `I need a comprehensive review of a pull request. Please analyze the code changes and provide specific comments, follow-up tasks, and a general review with a decision.

The review should follow a specific structure with:
1. Comments on specific parts of the diff (file path, line number, and comment text)
2. TODO items for follow-up work (if any)
3. General review comments and a decision (comment or request changes)

${ticketsInfo}`,
          },
          {
            role: "assistant",
            content: [toolUseBlock],
          },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: toolUseBlock.id,
                content: JSON.stringify({
                  prDetails,
                  prDiff,
                  linearTickets,
                }),
              },
            ],
          },
        ],
      });

      // Parse the final response to extract the review
      for (const block of toolResult.content) {
        if (block.type === "text") {
          const jsonMatch = block.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              const parsedReview = JSON.parse(jsonMatch[0]) as unknown;
              // Validate the parsed review against the schema
              return PRReviewSchema.parse(parsedReview);
            } catch (parseError) {
              console.error(
                chalk.red(
                  `Invalid review format: ${stringifyError(parseError)}`,
                ),
              );
              throw new Error("Failed to parse AI review response");
            }
          }
        }
      }
    }

    throw new Error("Could not generate PR review using tool");
  } catch (error) {
    console.error(
      chalk.red(`Error generating AI review: ${stringifyError(error)}`),
    );
    process.exit(1);
  }
};

const createLinearIssues = async (todos: TodoItem[]): Promise<void> => {
  if (!process.env.LINEAR_API_KEY) {
    console.log(
      chalk.yellow("LINEAR_API_KEY not set, skipping Linear issue creation"),
    );
    return;
  }

  const linear = new LinearClient({
    apiKey: process.env.LINEAR_API_KEY,
  });

  for (const todo of todos) {
    try {
      // Get the parent issue to fetch its details
      const parentIssue = await linear.issue(todo.ticketId);
      const team = await parentIssue.team;
      const assignee = await parentIssue.assignee;

      if (!team) {
        console.error(
          chalk.yellow(`Could not find team for ticket ${todo.ticketId}`),
        );
        continue;
      }

      // Create a ProseMirror document for the description
      const description = JSON.stringify({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: `This ticket tracks remaining tasks from ${todo.ticketId} that were not addressed in PR.`,
              },
            ],
          },
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "text",
                        text: todo.description,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });

      const issueCreateInput = {
        title: `Follow-up from ${todo.ticketId}: ${todo.description.substring(
          0,
          50,
        )}${todo.description.length > 50 ? "..." : ""}`,
        description,
        teamId: team.id,
        parentId: parentIssue.id, // Use the UUID, not the H-XXXX identifier
        assigneeId: assignee?.id,
      };

      const issue = await linear.createIssue(issueCreateInput);

      if (issue.success && issue.issue) {
        const createdIssue = await linear.issue((await issue.issue).id);
        console.log(
          chalk.green(
            `Created Linear issue ${createdIssue.identifier}: ${createdIssue.title}`,
          ),
        );
      } else {
        console.error(
          chalk.red(`Failed to create Linear issue for ${todo.ticketId}`),
        );
      }
    } catch (error) {
      console.error(
        chalk.red(`Error creating Linear issue: ${stringifyError(error)}`),
      );
    }
  }
};

const addDiffComments = async (
  prNumber: string,
  comments: DiffComment[],
): Promise<void> => {
  for (const comment of comments) {
    try {
      await execa("gh", [
        "pr",
        "review",
        prNumber,
        "--comment",
        "--body",
        comment.comment,
        "--path",
        comment.filePath,
        "--line",
        comment.lineNumber.toString(),
      ]);
      console.log(
        chalk.green(
          `Added comment to ${comment.filePath}:${comment.lineNumber}`,
        ),
      );
    } catch (error) {
      console.error(
        chalk.red(
          `Error adding comment to ${comment.filePath}:${
            comment.lineNumber
          }: ${stringifyError(error)}`,
        ),
      );
    }
  }
};

const submitPRReview = async (
  prNumber: string,
  generalReview: { text: string; decision: "comment" | "request-changes" },
): Promise<void> => {
  try {
    const decision =
      generalReview.decision === "request-changes"
        ? "--request-changes"
        : "--comment";

    await execa("gh", [
      "pr",
      "review",
      prNumber,
      decision,
      "--body",
      generalReview.text,
    ]);

    console.log(
      chalk.green(
        `Submitted PR review with decision: ${generalReview.decision}`,
      ),
    );
  } catch (error) {
    console.error(
      chalk.red(`Error submitting PR review: ${stringifyError(error)}`),
    );
  }
};

const processReviewResults = async (
  prNumber: string,
  review: PRReview,
): Promise<void> => {
  // 1. Create Linear issues for TODOs if any
  if (review.todos && review.todos.length > 0) {
    await createLinearIssues(review.todos);
  }

  // 2. Add comments on the diff
  if (review.diffComments.length > 0) {
    await addDiffComments(prNumber, review.diffComments);
  }

  // 3. Submit the general review
  await submitPRReview(prNumber, review.generalReview);
};

const main = async (): Promise<void> => {
  // Check for ANTHROPIC_API_KEY
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      chalk.red("Error: ANTHROPIC_API_KEY is not set in the environment"),
    );
    process.exit(1);
  }

  // Check for GitHub CLI and authentication
  try {
    const { stdout } = await execa("gh", ["auth", "status"]);
    if (!stdout.includes("GH_TOKEN")) {
      console.error(
        chalk.red(
          "Error: GitHub CLI is not authenticated with a token. Please set GH_TOKEN in the environment.",
        ),
      );
      process.exit(1);
    }
  } catch (error) {
    console.error(
      chalk.red(
        `Error: GitHub CLI not found or not working. Please install the GitHub CLI (gh). ${stringifyError(
          error,
        )}`,
      ),
    );
    process.exit(1);
  }

  // Parse PR number from command line arguments
  const prArg = process.argv[2];
  if (!prArg) {
    console.error(chalk.red("Error: No PR number provided"));
    console.log("Usage: yarn exe scripts/ai-pr-review.ts <PR_NUMBER>");
    process.exit(1);
  }

  // Remove leading # if present
  const prNumber = prArg.replace(/^#/, "");
  if (!/^\d+$/.test(prNumber)) {
    console.error(chalk.red(`Error: Invalid PR number: ${prArg}`));
    process.exit(1);
  }

  console.log(chalk.blue(`Gathering information for PR #${prNumber}...`));

  // Fetch PR details using GitHub CLI
  const prDetails = await getPRDetails(prNumber);
  const prDiff = await getPRDiff(prNumber);

  // Extract Linear ticket IDs from PR title
  const linearTicketIds = await extractLinearTicketIds(prDetails);

  if (linearTicketIds.length === 0) {
    console.log(chalk.yellow("No Linear ticket IDs found in PR title"));
  } else {
    console.log(
      chalk.green(`Found Linear ticket IDs: ${linearTicketIds.join(", ")}`),
    );
  }

  // Fetch Linear ticket details
  const linearTickets = await fetchLinearTickets(linearTicketIds);

  // Generate AI review
  console.log(chalk.blue("Generating AI review..."));
  const review = await generateAIReview(prDetails, prDiff, linearTickets);

  // Process the review results
  await processReviewResults(prNumber, review);

  console.log(chalk.green("PR review completed successfully!"));
};

main().catch((error) => {
  console.error(chalk.red(`Unhandled error: ${stringifyError(error)}`));
  process.exit(1);
});

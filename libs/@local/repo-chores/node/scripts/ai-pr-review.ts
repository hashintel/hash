#!/usr/bin/env node

import { Anthropic } from "@anthropic-ai/sdk";
import { sleep } from "@anthropic-ai/sdk/core";
import { LinearClient } from "@linear/sdk";
import {
  type HydratedLinearIssue,
  hydrateLinearIssue,
} from "@local/hash-backend-utils/linear";
import { stringifyError } from "@local/hash-isomorphic-utils/stringify-error";
import chalk from "chalk";
import { config } from "dotenv-flow";
import execa from "execa";
import { z } from "zod";
import zodToJsonSchema, {
  type JsonSchema7ObjectType,
} from "zod-to-json-schema";

import { addLineNumbersToDiff } from "./ai-pr-review/add-diff-line-numbers";
import {
  type ExistingCommentThread,
  getPrComments,
} from "./ai-pr-review/get-existing-ai-comment-threads";

config({ path: "../../../../.env.local", silent: true });

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY is not set");
}

if (!process.env.LINEAR_APPLICATION_ACCESS_TOKEN) {
  throw new Error("LINEAR_APPLICATION_ACCESS_TOKEN is not set");
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const linear = new LinearClient({
  accessToken: process.env.LINEAR_APPLICATION_ACCESS_TOKEN,
});

const NewDiffCommentSchema = z.object({
  comment: z
    .string()
    .describe(
      "Provide a comment on the specific part of the diff. Use ```suggestion```s if you have a specific implementation to suggest.",
    ),
  filePath: z
    .string()
    .describe("The path to the file that the comment is about."),
  position: z
    .number()
    .int()
    .positive()
    .describe(
      "Provide the position in the diff. This is 'x' in [position: x] at the end of the line of the diff provided to you.",
    ),
});

const CommentReplySchema = z.object({
  comment: z
    .string()
    .describe(
      "The comment to reply with. Tag the author(s) of comment(s) you are replying to with @author.",
    ),
  threadId: z
    .number()
    .describe(
      "The ID of the thread to reply to. A thread may contain multiple comments you want to reply to. Just post a single comment with different lines @tagging the relevant authors (look for the 'author' field in the comments you're replying to).",
    ),
});

const TodoItemSchema = z.object({
  todos: z.array(z.string()),
  ticketId: z.string().regex(/^H-\d+$/, "Must be in format H-XXXX"),
});

const PRReviewSchema = z.object({
  diffComments: z
    .array(NewDiffCommentSchema)
    .describe(
      "Provide comments on specific parts of the diff, related to code quality, readability, maintainability, error handling, performance, etc. Don't repeat comments you've made in previous reviews. These will be provided to you.",
    ),
  commentReplies: z
    .array(CommentReplySchema)
    .nullable()
    .describe(
      "If there are comment threads awaiting your response, provide your replies here.",
    ),
  ticketTodos: z
    .array(TodoItemSchema)
    .nullable()
    .describe(
      "If there are missed or misinterpreted requirements from the Linear ticket, provide a list of suggested follow-up todos. Don't duplicate todos from your diff comments. This should only be for missed/wrong requirements. If there are none, you can pass 'null' for this.",
    ),
  generalReview: z
    .object({
      text: z.string(),
      decision: z.enum(["comment", "request-changes"]),
    })
    .describe(
      "Provide a general overview of the PR, including a justification for a 'request-changes' decision if you have made one. Don't provide detail of any requirement issues from the Linear ticket – these will be captured separately. Don't just repeat the TODO list.",
    ),
});

const LinearTicketIdsSchema = z.object({
  ticketIds: z.array(z.string().regex(/^H-\d+$/, "Must be in format H-XXXX")),
});

const getPRDetails = async (prNumber: string): Promise<string> => {
  try {
    const { stdout } = await execa("gh", [
      "pr",
      "view",
      prNumber,
      "--comments",
      "--json",
      "title,body",
      "-q",
      '"<Title>" + .title + "</Title>\n<Description>" + .body + "</Description>\n"',
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
    const extractTicketIdsTool = {
      name: "submit_linear_ticket_ids",
      description: "Provide the Linear ticket IDs from the input string.",
      input_schema: zodToJsonSchema(
        LinearTicketIdsSchema,
      ) as JsonSchema7ObjectType,
    };

    const response = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 1000,
      tools: [extractTicketIdsTool],
      tool_choice: { type: "tool", name: "submit_linear_ticket_ids" },
      messages: [
        {
          role: "user",
          content: `Please extract all Linear ticket IDs (in the format H-XXXX where XXXX is a number) from this PR title: ${
            prDetails.split("\n")[0]
          }`,
        },
      ],
    });

    const toolUseBlock = response.content.find(
      (block) => block.type === "tool_use",
    );

    if (!toolUseBlock) {
      throw new Error("No tool use block found in extract ticket IDs response");
    }

    const { ticketIds } = LinearTicketIdsSchema.parse(toolUseBlock.input);

    return ticketIds;
  } catch (error) {
    console.error(
      chalk.red(
        `Error extracting Linear ticket IDs from PR details: ${stringifyError(
          error,
        )}`,
      ),
    );
    return [];
  }
};

const fetchLinearTickets = async (ticketIds: string[]) => {
  const tickets = await Promise.all(
    ticketIds.map(async (id) => {
      const issue = await linear.issue(id);
      return hydrateLinearIssue({ issue, includeComments: true });
    }),
  );

  return tickets;
};

const aiReviewSystemPrompt = `
You are 'hashdotai', a senior software engineer providing code reviews on pull requests.

## Your Role and Approach
- You are constructive, concise and focused.
- You provide specific, actionable feedback with clear suggestions for improvement
- You balance being direct with being respectful and collaborative
- You focus on substantive issues rather than stylistic preferences unless they impact readability
- You use code suggestions when appropriate to demonstrate your recommended changes

## Review Focus Areas
1. Code correctness and potential bugs
2. Performance considerations and optimizations
3. Security vulnerabilities and best practices
4. Error handling and edge cases
5. Code organization and architecture
6. Readability and maintainability
7. Adherence to requirements specified in any linked Linear ticket

## Response Components
Your review includes some or all of the following components:

1. Diff comments
   - Comment on specific parts of the diff where improvements are needed
   - Use \`\`\`suggestion\`\`\` blocks for concrete implementation suggestions
   - Don't make "this looks good" comments - focus only on improvements
   - Don't repeat comments from previous reviews (these will be provided to you)

2. Comment replies
   - Respond to any comment threads awaiting your input (you will be told if they do or do not)
   - Always @mention the relevant participants in the conversation – check the comment threads carefully to find them. Don't tag yourself!
   - Be helpful and address the specific questions or concerns raised

3. Ticket TODOs (OPTIONAL)
   - Only include missed or misinterpreted requirements from the Linear ticket
   - Don't duplicate issues already mentioned in diff comments
   - Organize todos by ticket ID
   - Be specific about what was missed and what needs to be done
   - You don't need to provide this if there are no _requirement_ issues – leave code improvements for elsewhere

4. General comments
   - Provide an overall assessment of the PR
   - Justify any "request-changes" decision with clear reasoning
   - Don't repeat the todo list or specific diff comments – your colleagues don't need these twice
   - Focus on the big picture and overall quality

## Decision Guidelines
- Use "comment" for PRs with minor issues that don't block merging
- Use "request-changes" for PRs with significant issues that should be addressed before merging
- Base your decision on the severity and quantity of issues found
`;

/**
 * Preprocesses the AI review response to fix a common formatting issue (arrays being returned as strings)
 */
const preprocessAiReviewResponse = (
  response: unknown,
): Record<string, unknown> => {
  if (typeof response !== "object" || response === null) {
    throw new Error("AI review response is not an object");
  }

  const processed: Record<string, unknown> = {
    ...(response as Record<string, unknown>),
  };

  // Fix arrays that are returned as strings
  for (const [key, value] of Object.entries(processed)) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmedValue = value.trim();

    if (trimmedValue.startsWith("[") && trimmedValue.endsWith("]")) {
      try {
        // Attempt to parse the string as JSON
        processed[key] = JSON.parse(trimmedValue);
      } catch {
        console.warn(
          chalk.yellow(
            `Failed to parse string as JSON array for key "${key}". Attempting manual conversion...`,
          ),
        );

        // If JSON.parse fails, try to manually convert the string to an array
        try {
          // Handle the case where the array elements are objects
          if (trimmedValue.includes("{") && trimmedValue.includes("}")) {
            // Split by "},{"
            const items = trimmedValue
              .replace(/^\[\s*{/, "") // Remove leading [{
              .replace(/}\s*\]$/, "") // Remove trailing }]
              .split(/},\s*{/);

            const arrayItems = items.map((item) => {
              // Add back the curly braces
              const objectStr = item.startsWith("{") ? item : `{${item}`;
              const fullObjectStr = objectStr.endsWith("}")
                ? objectStr
                : `${objectStr}}`;

              try {
                // Use type assertion to avoid unsafe return
                return JSON.parse(fullObjectStr) as Record<string, unknown>;
              } catch {
                console.error(
                  chalk.red(`Failed to parse object: ${fullObjectStr}`),
                );
                process.exit(1);
                return null;
              }
            });

            processed[key] = arrayItems;
          } else {
            // Handle simpler arrays (strings, numbers, etc.)
            const items = trimmedValue
              .substring(1, trimmedValue.length - 1) // Remove [ and ]
              .split(",")
              .map((item) => item.trim());

            processed[key] = items.map((item) => {
              // Try to convert to appropriate type
              if (item.startsWith('"') && item.endsWith('"')) {
                return item.substring(1, item.length - 1); // Remove quotes
              }

              const num = Number(item);
              if (!Number.isNaN(num)) {
                return num;
              }

              if (item === "true") {
                return true;
              }
              if (item === "false") {
                return false;
              }
              if (item === "null") {
                return null;
              }

              return item;
            });
          }
        } catch (manualError) {
          console.error(
            chalk.red(
              `Failed manual conversion for key "${key}": ${stringifyError(
                manualError,
              )}`,
            ),
          );

          process.exit(1);
        }
      }
    }
  }

  return processed;
};

const generateAIReview = async ({
  prDetails,
  prDiff,
  linearTickets,
  previousAiCommentThreads,
  previousErrors,
}: {
  prDetails: string;
  prDiff: string;
  linearTickets: HydratedLinearIssue[];
  previousAiCommentThreads: ExistingCommentThread[];
  previousErrors: string | null;
}): Promise<z.infer<typeof PRReviewSchema>> => {
  const generateReviewTool = {
    name: "submit_pr_review",
    description:
      "Submit a code review for a pull request. The review should include specific comments with suggested changes on parts of the diff, follow-up tasks if needed, and a general review with a decision to either comment or request changes.",
    input_schema: zodToJsonSchema(PRReviewSchema) as JsonSchema7ObjectType,
  };

  try {
    const userMessage = `Hello, hashdotai! 
    
Please review the following pull request.

I've provided the:
1. PR Overview – this explains the purpose of the PR
2. PR Diff – this shows the changes made in the PR
3. Linear Tickets – these are any Linear tickets linked to the PR
4. Comments Awaiting Response – these are any comments on the PR that are awaiting a response from you
5. Other Comments Previously Made – these are any comments you or others have made on the PR previously. 

<PR Overview>
${prDetails}
</PR Overview>

<PR Diff>
${prDiff}
</PR Diff>

<Linear Tickets>
${linearTickets.map((ticket) => JSON.stringify(ticket, null, 2)).join("\n")}
</Linear Tickets>

<Comments Awaiting Response – consider replying to these>
${previousAiCommentThreads
  .filter((thread) => thread.requiresAiResponse !== "no")
  .map(
    (thread) => `<Comment>
Reply to id: ${thread.threadId}
Reply required: ${
      thread.requiresAiResponse === "yes" ? "Yes" : "If you can help"
    }
Original comment: ${thread.body}
File path: ${thread.path}
  <Replies>
  ${thread.replies
    .map((reply) => `    Author (tag with @${reply.author}): ${reply.body}`)
    .join("\n---\n")}
  </Replies>
</Comment>`,
  )
  .join("\n---\n")}
</Comments Awaiting Response>

<Other Comments Previously Made – don't repeat these>
${previousAiCommentThreads
  .filter((thread) => thread.requiresAiResponse === "no")
  .map(
    (thread) => `<Comment>
Original comment: ${thread.body}
File path: ${thread.path}
  <Replies>
  ${thread.replies
    .map((reply) => `Author (@${reply.author}): ${reply.body}`)
    .join("\n---\n")}
  </Replies>
</Comment>`,
  )
  .join("\n---\n")}
</Other Comments Previously Made>

${previousErrors ? `\n\nPrevious errors: ${previousErrors}` : ""}
`;

    const response = await anthropic.messages.create({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 4000,
      system: aiReviewSystemPrompt,
      tools: [generateReviewTool],
      tool_choice: { type: "tool", name: "submit_pr_review" },
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

    const toolUseBlock = response.content.find(
      (block) => block.type === "tool_use",
    );

    if (!toolUseBlock) {
      throw new Error("No tool use block found in PR review response");
    }

    console.log(JSON.stringify(toolUseBlock.input, null, 2));

    try {
      // Preprocess the response to fix malformed JSON arrays
      const preprocessedInput = preprocessAiReviewResponse(toolUseBlock.input);

      // Parse with Zod schema
      const parsedReview = PRReviewSchema.parse(preprocessedInput);

      const { commentReplies } = parsedReview;

      const badTags: {
        incorrectTags: string[];
        threadId: number;
        validTags: string[];
      }[] = [];

      const invalidCommentIds: number[] = [];

      for (const commentReply of commentReplies ?? []) {
        const originalComment = previousAiCommentThreads.find(
          (thread) => thread.threadId === commentReply.threadId,
        );

        if (!originalComment) {
          invalidCommentIds.push(commentReply.threadId);
          continue;
        }

        const tagsInComment = commentReply.comment.match(/@[^\s]+/g);

        const validTags = [
          originalComment.author,
          ...originalComment.replies.map((reply) => reply.author),
        ].filter((tag) => tag !== "hashdotai");

        const invalidTags = tagsInComment?.filter(
          (tag) => !validTags.includes(tag),
        );

        if (invalidTags?.length) {
          badTags.push({
            incorrectTags: invalidTags,
            threadId: commentReply.threadId,
            validTags,
          });
        }
      }

      const errorStrings = [
        ...(badTags.length
          ? badTags.map(
              ({ threadId, validTags, incorrectTags }) =>
                `You provided a response to comment id ${threadId} and tagged these authors, but they are invalid: ${incorrectTags.join(
                  ", ",
                )}. The valid tags are: ${validTags.join(
                  ", ",
                )}. You must tag participants in the conversation (and not yourself – you are 'hashdotai')`,
            )
          : []),
        ...(invalidCommentIds.length
          ? [
              `You provided a response to these comments, but they don't exist: ${invalidCommentIds.length}`,
            ]
          : []),
      ];

      if (errorStrings.length) {
        const errorString = errorStrings.join("\n");

        console.error(
          chalk.red(`AI response had comment errors, retrying: ${errorString}`),
        );

        return generateAIReview({
          prDetails,
          prDiff,
          linearTickets,
          previousAiCommentThreads,
          previousErrors: errorString,
        });
      }

      console.log(JSON.stringify(parsedReview, null, 2));
      return parsedReview;
    } catch (err) {
      console.error(
        chalk.red(`Error parsing PR review – retrying: ${stringifyError(err)}`),
      );

      // Log the raw input to help debug parsing issues
      console.error(chalk.yellow("Raw input that failed to parse:"));
      console.error(JSON.stringify(toolUseBlock.input, null, 2));

      await sleep(2_000);

      return generateAIReview({
        prDetails,
        prDiff,
        linearTickets,
        previousAiCommentThreads,
        previousErrors:
          "Your last review didn't meet the response schema – please try again. Make sure arrays are properly formatted as JSON arrays, not strings.",
      });
    }
  } catch (error) {
    console.error(
      chalk.red(
        `Error generating AI review. Retrying... ${stringifyError(error)}`,
      ),
    );

    await sleep(2_000);

    return generateAIReview({
      prDetails,
      prDiff,
      linearTickets,
      previousAiCommentThreads,
      previousErrors:
        "An error occurred while generating your review. Please try again.",
    });
  }
};

const createLinearIssues = async (
  ticketTodos: z.infer<typeof TodoItemSchema>[] | null,
): Promise<string[]> => {
  const createdTicketIds: string[] = [];

  if (!ticketTodos) {
    return createdTicketIds;
  }

  for (const ticketTodo of ticketTodos) {
    if (ticketTodo.todos.length === 0) {
      continue;
    }

    try {
      const parentIssue = await linear.issue(ticketTodo.ticketId);
      const parentIssueTeam = await parentIssue.team;
      const parentIssueAssignee = await parentIssue.assignee;

      if (!parentIssueTeam) {
        console.error(
          chalk.yellow(`Could not find team for ticket ${ticketTodo.ticketId}`),
        );
        continue;
      }

      // A Markdown-formatted string with - [ ] checklists
      const description = `This ticket tracks suggested follow-up tasks from ${
        ticketTodo.ticketId
      }:

${ticketTodo.todos.map((todo) => `- [ ] ${todo}`).join("\n")}`;

      const issueCreateInput = {
        assigneeId: parentIssueAssignee?.id,
        createAsUser: "PR Reviewer",
        description,
        displayIconUrl: "https://hash.dev/favicon.png",
        parentId: parentIssue.id, // This is the UUID, not the H-XXXX identifier (parentIssue.identifier). Linear requires the UUID here.
        teamId: parentIssueTeam.id,
        title: `AI-suggested follow-ups for ${ticketTodo.ticketId}`,
      };

      const issue = await linear.createIssue(issueCreateInput);

      if (issue.success && issue.issue) {
        const createdIssue = await linear.issue((await issue.issue).id);
        console.log(
          chalk.green(
            `Created Linear issue ${createdIssue.identifier}: ${createdIssue.title}`,
          ),
        );
        createdTicketIds.push(createdIssue.identifier);
      } else {
        console.error(
          chalk.red(`Failed to create Linear issue for ${ticketTodo.ticketId}`),
        );
      }
    } catch (error) {
      console.error(
        chalk.red(`Error creating Linear issue: ${stringifyError(error)}`),
      );
    }
  }

  return createdTicketIds;
};

const submitPRReview = async ({
  prNumber,
  prReview,
  createdTicketIds,
}: {
  prNumber: string;
  prReview: z.infer<typeof PRReviewSchema>;
  createdTicketIds: string[];
}): Promise<void> => {
  try {
    const { generalReview, diffComments, commentReplies, ticketTodos } =
      prReview;

    const body = ticketTodos?.length
      ? `${
          generalReview.text
        }\n\nI've created the following tickets with suggested follow-ups: ${createdTicketIds
          .map((id) => `${id}`)
          .join(", ")}`
      : generalReview.text;

    const { stdout: prInfo } = await execa("gh", [
      "pr",
      "view",
      prNumber,
      "--json",
      /**
       * Mainly we need headRefOid here.
       * headRepository and headRepositoryOwner could be injected automatically by the GitHub CLI via {owner} and {repo} placeholders,
       * but since we need to make this request for the ref anyway we might as well take them from here.
       */
      "headRefOid,headRepository,headRepositoryOwner",
    ]);

    const {
      headRefOid,
      headRepository: { name: repo },
      headRepositoryOwner: { login: owner },
    } = JSON.parse(prInfo) as {
      headRefOid: string;
      headRepository: { name: string };
      headRepositoryOwner: { login: string };
    };

    await Promise.all(
      (commentReplies ?? []).map(async (reply) => {
        await execa("gh", [
          "api",
          "--method",
          "POST",
          "-H",
          "Accept: application/vnd.github+json",
          "-H",
          "X-GitHub-Api-Version: 2022-11-28",
          `/repos/${owner}/${repo}/pulls/${prNumber}/comments/${reply.threadId}/replies`,
          "-f",
          `body=${reply.comment}`,
        ]);
      }),
    );

    if (commentReplies?.length) {
      console.log(
        chalk.green(`Submitted ${commentReplies.length} comment replies`),
      );
    }

    const comments = diffComments.map((comment) => ({
      path: comment.filePath,
      position: comment.position,
      body: comment.comment,
    }));

    const payload = {
      commit_id: headRefOid,
      body,
      event:
        generalReview.decision === "request-changes"
          ? "REQUEST_CHANGES"
          : "COMMENT",
      comments,
    };

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${process.env.GH_TOKEN}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      console.error(chalk.red(`GitHub API error: ${response.status}`));
      process.exit(1);
    }

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
  review: z.infer<typeof PRReviewSchema>,
): Promise<void> => {
  const createdTicketIds = await createLinearIssues(review.ticketTodos);

  await submitPRReview({
    prNumber,
    prReview: review,
    createdTicketIds,
  });
};

const main = async (): Promise<void> => {
  // Check for GitHub CLI and authentication
  try {
    const { stdout } = await execa("gh", ["auth", "status"]);
    if (!stdout.includes("GH_TOKEN")) {
      console.error(
        chalk.red(
          "Error: GitHub CLI is not authenticated with a token. Please set GH_TOKEN in the environment to act as a machine user.",
        ),
      );
      process.exit(1);
    }
  } catch {
    console.error(
      chalk.red(
        "Error: GitHub CLI not found or not working. Please install the GitHub CLI (gh) and/or check validity of the provided GH_TOKEN",
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

  // Remove leading # if present (i.e. user supplied #1234)
  const prNumber = prArg.replace(/^#/, "");
  if (!/^\d+$/.test(prNumber)) {
    console.error(chalk.red(`Error: Invalid PR number: ${prArg}`));
    process.exit(1);
  }

  console.log(chalk.blue(`Gathering information for PR #${prNumber}...`));

  const prDetails = await getPRDetails(prNumber);
  const unnumberedPrDiff = await getPRDiff(prNumber);

  const prDiff = addLineNumbersToDiff(unnumberedPrDiff);

  const linearTicketIds = await extractLinearTicketIds(prDetails);

  const previousAiCommentThreads = await getPrComments(prNumber);

  if (linearTicketIds.length === 0) {
    console.log(chalk.red("No Linear ticket IDs found in PR title"));
    process.exit(1);
  } else {
    console.log(
      chalk.green(`Found Linear ticket IDs: ${linearTicketIds.join(", ")}`),
    );
  }

  const linearTickets = await fetchLinearTickets(linearTicketIds);

  console.log(chalk.blue("Generating AI review..."));
  const review = await generateAIReview({
    prDetails,
    prDiff,
    linearTickets,
    previousAiCommentThreads,
    previousErrors: null,
  });

  await processReviewResults(prNumber, review);

  console.log(chalk.green("PR review completed successfully!"));
};

main().catch((error) => {
  console.error(chalk.red(`Unhandled error: ${stringifyError(error)}`));
  process.exit(1);
});

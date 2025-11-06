import type Anthropic from "@anthropic-ai/sdk";
import type { HydratedLinearIssue } from "@local/hash-backend-utils/linear";
import chalk from "chalk";
import { z } from "zod";
import zodToJsonSchema, {
  type JsonSchema7ObjectType,
} from "zod-to-json-schema";

import { sleep } from "../shared/time";
import type { ExistingCommentThread } from "./get-pr-comments";

export const NewDiffCommentSchema = z.object({
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

export const TodoItemSchema = z.object({
  todos: z.array(
    z
      .string()
      .describe(
        "A todo item to be completed, which is related to a requirement listed in the Linear ticket.",
      ),
  ),
  ticketId: z.string().regex(/^H-\d+$/, "Must be in format H-XXXX"),
});

export const PRReviewSchema = z.object({
  diffComments: z
    .array(NewDiffCommentSchema)
    .describe(
      "Provide comments on specific parts of the diff, related to code quality, readability, maintainability, error handling, performance, etc. Don't repeat comments you've made in previous reviews. These will be provided to you. Pass an empty array if there are no comments to provide.",
    ),
  ticketTodos: z
    .array(TodoItemSchema)
    .nullable()
    .optional()
    .describe(
      "If there are missed or misinterpreted requirements from the Linear ticket, provide a list of suggested follow-up todos. Each todo must be clearly related to a requirement mentioned in the ticket or its comments. Don't duplicate todos from your diff comments. This should only be for missed/wrong requirements for requirements mentioned in the Linear ticket. If there are none, you can pass 'null' for this.",
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

3. Ticket TODOs (OPTIONAL)
    - Only include missed or misinterpreted requirements from a linked Linear ticket. Skip providing this if you have no suggestions based on the Linear ticket comments and description.
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

type PRReview = z.infer<typeof PRReviewSchema>;

/**
 * Step 2: Generate the actual PR review (diff comments, TODOs, general feedback)
 */
export const generatePRReview = async ({
  anthropic,
  attempt = 1,
  commentThreads,
  prOverview,
  prDiff,
  linearTickets,
  previousErrors,
}: {
  anthropic: Anthropic;
  attempt?: number;
  commentThreads: ExistingCommentThread[];
  prDiff: string;
  prOverview: string;
  linearTickets: HydratedLinearIssue[];
  previousErrors: string | null;
}): Promise<PRReview> => {
  if (attempt > 3) {
    throw new Error("Too many attempts retrying generatePRReview");
  }

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
3. Comment threads on the PR – don't repeat comments already covered by these. You'll see where you (i.e. @hashdotai) have made previous comments.

<PR Overview>
${prOverview}
</PR Overview>

<PR Diff>
${prDiff}
</PR Diff>

<Linear Tickets>
${linearTickets.map((ticket) => JSON.stringify(ticket, null, 2)).join("\n")}
</Linear Tickets>

<Comments on the PR>
${commentThreads
  .map(
    (thread) => `<Comment>
Original comment: ${thread.body}
File path: ${thread.path}
Position in diff: ${thread.position}
Resolved: ${thread.isResolved}
  <Replies>
  ${thread.replies
    .map((reply) => `Author (@${reply.author}): ${reply.body}`)
    .join("\n---\n")}
  </Replies>
</Comment>`,
  )
  .join("\n---\n")}
</Comments on the PR>
${
  previousErrors
    ? `\n\nYour previous review had these errors – please avoid them this time: ${previousErrors}`
    : ""
}
Now please submit your review. Remember that a 'request changes' decision will block merging, and you should specify which of your suggested changes are required and justify your decision.
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

    console.log(chalk.blue("PR review generated, parsing..."));

    try {
      /**
       * Claude has a habit of passing objects and arrays within a response object as an escaped JSON string, so we need to watch for and parse it back.
       * This isn't foolproof. There are a lot of ways it can break the formatting –  this just handles string values that can be parsed back to JSON.
       */
      const processedInput: Record<string, unknown> = {
        ...(toolUseBlock.input as Record<string, unknown>),
      };

      for (const [key, value] of Object.entries(processedInput)) {
        if (typeof value === "string") {
          try {
            processedInput[key] = JSON.parse(value);
            console.info(
              chalk.white(
                `Model provided string for key "${key}", automatically parsed as JSON`,
              ),
            );
          } catch {
            console.error(
              chalk.red(`Failed to parse string as JSON for key "${key}"`),
            );
          }
        }
      }

      const parsedReview = PRReviewSchema.parse(processedInput);

      return parsedReview;
    } catch {
      console.error(chalk.red("Error parsing PR review – retrying"));

      /**
       * Avoid hammering the Anthropic API.
       */
      await sleep(2_000);

      return generatePRReview({
        anthropic,
        attempt: attempt + 1,
        commentThreads,
        linearTickets,
        prDiff,
        prOverview,
        previousErrors:
          "Your last review didn't meet the response schema – please try again.",
      });
    }
  } catch {
    console.error(chalk.red("Error generating PR review – retrying"));

    await sleep(2_000);

    return generatePRReview({
      anthropic,
      attempt: attempt + 1,
      commentThreads,
      linearTickets,
      prDiff,
      prOverview,
      previousErrors:
        "An error occurred while generating your review. Please try again.",
    });
  }
};

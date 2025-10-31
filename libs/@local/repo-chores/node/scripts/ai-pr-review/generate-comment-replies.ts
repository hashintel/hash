/**
 * Comment reply generation for AI PR review
 *
 * This module handles generating and validating replies to PR comments.
 *
 * Tag validation:
 * - Extracts tags with @ prefix from AI comments
 * - Compares them to valid usernames (without @ prefix) from original comments and replies
 * - Filters out special names like "hashdotai" (the AI itself) and "you" (generic reference)
 * - Provides clear error feedback if the AI uses invalid tags
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { HydratedLinearIssue } from "@local/hash-backend-utils/linear";
import chalk from "chalk";
import { z } from "zod";
import zodToJsonSchema, {
  type JsonSchema7ObjectType,
} from "zod-to-json-schema";

import { sleep } from "../shared/time";
import type { ExistingCommentThread } from "./get-pr-comments";

export const CommentReplySchema = z.object({
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

const CommentRepliesSchema = z.object({
  commentReplies: z.array(CommentReplySchema),
});

const replySystemPrompt = `
You are 'hashdotai', a senior software engineer providing responses to code review comments.

## Your Task
You are responding to comments on a pull request. For each comment:
1. Read the original comment and any existing replies carefully
2. If a response is required, provide a helpful, constructive response. If it's optional, reply if you can add value. Don't reply for the sake of it – it takes up your time unnecessarily.
3. Always @mention the relevant participants in the conversation by using the exact username with @ prefix (e.g., @username). For example, if responding to user 'johndoe', tag them as '@johndoe'.
4. Don't tag yourself (@hashdotai) in your responses
5. Never use general tags like "you" - always use specific GitHub usernames with the @ prefix
6. Be specific and address the questions or concerns raised
7. Provide code suggestions using GitHub's code suggestion format if you can suggest a specific code change / implementation. When doing a suggestion, make sure you describe why you suggest the change.
`;

/**
 * Step 1: Generate replies to existing comments
 */
export const generateCommentReplies = async ({
  anthropic,
  attempt = 1,
  linearTickets,
  prDiff,
  prOverview,
  commentThreads,
  previousErrors,
}: {
  anthropic: Anthropic;
  linearTickets: HydratedLinearIssue[];
  prDiff: string;
  prOverview: string;
  commentThreads: ExistingCommentThread[];
  previousErrors: string | null;
  attempt?: number;
}): Promise<z.infer<typeof CommentReplySchema>[]> => {
  if (attempt > 3) {
    throw new Error("Too many attempts retrying generateCommentReplies");
  }

  // Only process threads that require a response
  const threadsRequiringResponse = commentThreads.filter(
    (thread) => thread.requiresAiResponse !== "no",
  );

  // If there are no threads requiring response, return empty array
  if (threadsRequiringResponse.length === 0) {
    console.log(
      chalk.white("No comment threads requiring response, skipping..."),
    );
    return [];
  }

  console.log(
    chalk.blue(
      `Checking for comment replies to ${threadsRequiringResponse.length} potential threads...`,
    ),
    JSON.stringify(threadsRequiringResponse, null, 2),
  );

  const generateRepliesTools = {
    name: "submit_comment_replies",
    description: "Submit replies to existing PR comments that need a response.",
    input_schema: zodToJsonSchema(
      CommentRepliesSchema,
    ) as JsonSchema7ObjectType,
  };

  try {
    const userMessage = `Hello, hashdotai!

  I need you to respond to some comments on a pull request. Please review the comments and provide helpful replies, where you can add value.

  <PR Overview>
  ${prOverview}
  </PR Overview>

  <PR Diff>
  ${prDiff}
  </PR Diff>

  <Relevant Linear Tickets>
  ${linearTickets.map((ticket) => JSON.stringify(ticket, null, 2)).join("\n")}
  </Relevant Linear Tickets>

  <Comments Awaiting Response>
  ${threadsRequiringResponse
    .map(
      (thread) => `<Comment>
  Reply to thread id: ${thread.threadId}
  Reply required: ${
    thread.requiresAiResponse === "yes" ? "Yes" : "If you can add value"
  }
  Original comment author: ${thread.author}
  Original comment: ${thread.body}
  File path: ${thread.path}
    <Replies>
    ${thread.replies
      .map(
        (reply) =>
          `<Author>@${reply.author}</Author><Comment>${reply.body}</Comment>`,
      )
      .join("\n---\n")}
    </Replies>
  </Comment>`,
    )
    .join("\n---\n")}
  </Comments Awaiting Response>

  ${
    previousErrors
      ? `\nYour previous comment replies contained these errors – please avoid them this time: ${previousErrors}`
      : ""
  }
  `;

    const response = await anthropic.messages.create({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 4000,
      system: replySystemPrompt,
      tools: [generateRepliesTools],
      tool_choice: { type: "tool", name: "submit_comment_replies" },
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
      throw new Error("No tool use block found in comment replies response");
    }

    try {
      const { commentReplies } = CommentRepliesSchema.parse(toolUseBlock.input);

      // Validate the replies
      const badTags: {
        incorrectTags: string[];
        threadId: number;
        validTagsWithoutPrefix: string[];
      }[] = [];

      const invalidCommentIds: number[] = [];

      for (const commentReply of commentReplies) {
        const originalComment = commentThreads.find(
          (thread) => thread.threadId === commentReply.threadId,
        );

        if (!originalComment) {
          invalidCommentIds.push(commentReply.threadId);
          continue;
        }

        // Extract tags with @ prefix from comment
        const tagsInComment =
          commentReply.comment.match(/@[a-zA-Z0-9_-]+/g) ?? [];

        // Create valid tags list WITHOUT @ prefix
        const validTagsWithoutPrefix = [
          originalComment.author,
          ...originalComment.replies.map((reply) => reply.author),
        ].filter((tag) => tag !== "hashdotai" && tag !== "you");

        // Convert tags in comment to remove @ for comparison
        const tagsInCommentWithoutPrefix = tagsInComment.map((tag) =>
          tag.startsWith("@") ? tag.substring(1) : tag,
        );

        // Compare without @ prefix
        const invalidTags = tagsInComment.filter(
          (_, index) =>
            !validTagsWithoutPrefix.includes(
              tagsInCommentWithoutPrefix[index]!,
            ),
        );

        if (invalidTags.length) {
          badTags.push({
            incorrectTags: invalidTags,
            threadId: commentReply.threadId,
            validTagsWithoutPrefix,
          });
        }
      }

      const errorStrings = [
        ...(badTags.length
          ? badTags.map(
              ({ threadId, validTagsWithoutPrefix, incorrectTags }) =>
                `You provided a response to comment id ${threadId} and tagged these authors, but they are invalid: ${incorrectTags.join(
                  ", ",
                )}. The valid tags are: ${validTagsWithoutPrefix
                  .map((tag) => (tag.startsWith("@") ? tag : `@${tag}`))
                  .join(
                    ", ",
                  )}. You must tag participants in the conversation (and not yourself – you are 'hashdotai')`,
            )
          : []),
        ...(invalidCommentIds.length
          ? [
              `You provided a response to these comments, but they don't exist: ${invalidCommentIds.join(
                ", ",
              )}`,
            ]
          : []),
      ];

      if (errorStrings.length) {
        const errorString = errorStrings.join("\n");

        console.error(
          chalk.red(`AI response had comment errors, retrying: ${errorString}`),
        );

        return generateCommentReplies({
          anthropic,
          attempt: attempt + 1,
          commentThreads,
          linearTickets,
          prDiff,
          prOverview,
          previousErrors: errorString,
        });
      }

      return commentReplies;
    } catch {
      console.error(chalk.red("Error parsing comment replies – retrying"));

      // Log the raw input to help debug parsing issues
      console.error(chalk.yellow("Raw input that failed to parse:"));
      console.error(JSON.stringify(toolUseBlock.input, null, 2));

      await sleep(2_000);

      return generateCommentReplies({
        anthropic,
        attempt: attempt + 1,
        commentThreads,
        linearTickets,
        prDiff,
        prOverview,
        previousErrors:
          "Your last response didn't meet the schema – please try again. Make sure arrays are properly formatted as JSON arrays, not strings.",
      });
    }
  } catch {
    console.error(chalk.red("Error generating comment replies – retrying"));

    await sleep(2_000);

    return generateCommentReplies({
      anthropic,
      attempt: attempt + 1,
      commentThreads,
      linearTickets,
      prDiff,
      prOverview,
      previousErrors:
        "An error occurred while generating your replies. Please try again.",
    });
  }
};

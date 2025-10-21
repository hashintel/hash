import chalk from "chalk";
import { execa } from "execa";
import { z } from "zod";

/**
 * Target format for existing comment threads, to be used to pass back to the AI when its review is requested again.
 */
export type ExistingCommentThread = {
  /**
   * The database id of the thread. This is the number the GitHub API requires when creating a reply to a comment thread.
   */
  threadId: number;
  /**
   * Whether the thread is resolved.
   */
  isResolved: boolean;
  /**
   * The author of the original comment (GitHub username, for `@tagging`)
   */
  author: string;
  /**
   * The body text of the original comment.
   */
  body: string;
  /**
   * The path to the file that the comment is about.
   */
  path: string;
  /**
   * The 'position' of the comment in the diff (if any), expressed as the line number relative to the first chunk in a file diff.
   * @see add-diff-line-numbers.ts
   */
  position: number | null;
  /**
   * Whether the AI needs to respond to the thread.
   * 'Yes' if it started the thread, but wasn't the last to reply. 'Maybe' if someone else started the thread, and the AI wasn't the last to reply. 'No' if the AI was the last to reply.
   */
  requiresAiResponse: "yes" | "no" | "maybe";
  /**
   * The replies to the original comment.
   */
  replies: {
    /**
     * The body text of the reply.
     */
    body: string;
    /**
     * The author of the reply (GitHub username, for `@tagging`)
     */
    author: string;
    /**
     * The date and time the reply was created.
     */
    createdAt: string;
  }[];
};

/**
 * Schema for a comment node in the GitHub API GraphQL response.
 */
const CommentNodeSchema = z.object({
  id: z.string(),
  author: z.object({
    login: z.string(),
  }),
  databaseId: z.number(),
  body: z.string(),
  createdAt: z.string(),
  path: z.string(),
  position: z.number().nullable(),
  replyTo: z
    .object({
      id: z.string(),
      author: z.object({
        login: z.string(),
      }),
    })
    .nullable()
    .optional(),
});

/**
 * Schema for the page info in the GitHub API GraphQL response.
 */
const PageInfoSchema = z.object({
  hasNextPage: z.boolean(),
  endCursor: z.string().nullable(),
});

/**
 * Schema for a comment thread node in the GitHub API GraphQL response.
 */
const ThreadNodeSchema = z.object({
  id: z.string(),
  path: z.string(),
  isResolved: z.boolean(),
  comments: z.object({
    nodes: z.array(CommentNodeSchema),
    pageInfo: PageInfoSchema,
  }),
});

/**
 * Schema for the GitHub API GraphQL response for review threads.
 */
const ReviewThreadsGraphQLResponseSchema = z.object({
  data: z.object({
    repository: z.object({
      pullRequest: z.object({
        reviewThreads: z.object({
          nodes: z.array(ThreadNodeSchema),
          pageInfo: PageInfoSchema,
        }),
      }),
    }),
  }),
});

type ThreadNode = z.infer<typeof ThreadNodeSchema>;

/**
 * Fetches all review threads with their comments, handling pagination.
 */
const fetchAllThreadsWithComments = async (
  prNumber: string,
  cursor?: string,
): Promise<ThreadNode[]> => {
  const query = `
      query($owner: String!, $repo: String!, $prNumber: Int!, $cursor: String) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $prNumber) {
            reviewThreads(first: 100, after: $cursor) {
              nodes {
                id
                path
                isResolved
                comments(first: 100) {
                  nodes {
                    id
                    databaseId
                    author {
                      login
                    }
                    body
                    createdAt
                    path
                    position
                    replyTo {
                      id
                      author {
                        login
                      }
                    }
                  }
                  pageInfo {
                    hasNextPage
                    endCursor
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      }
    `;

  try {
    const { stdout } = await execa("gh", [
      "api",
      "graphql",
      "-f",
      `query=${query}`,
      "-F",
      `prNumber=${prNumber}`,
      "-f",
      `owner=hashintel`,
      "-f",
      `repo=hash`,
      ...(cursor ? ["-f", `cursor=${cursor}`] : []),
    ]);

    const parsedResponse = ReviewThreadsGraphQLResponseSchema.parse(
      JSON.parse(stdout),
    );

    const threads =
      parsedResponse.data.repository.pullRequest.reviewThreads.nodes;

    const pageInfo =
      parsedResponse.data.repository.pullRequest.reviewThreads.pageInfo;

    if (pageInfo.hasNextPage && pageInfo.endCursor) {
      const nextThreads = await fetchAllThreadsWithComments(
        prNumber,
        pageInfo.endCursor,
      );
      return [...threads, ...nextThreads];
    }

    return threads;
  } catch {
    console.error(chalk.red("Error fetching review threads"));
    return [];
  }
};

/**
 * Fetches all comment threads on the PR, and nest the replies.
 *
 * Mark the thread as `requiresAiResponse`:
 * - 'yes' if the AI started the thread, but wasn't the last to reply
 * - 'maybe' if someone else started the thread, and the AI wasn't the last to reply
 * - 'no' if the AI was the last to reply
 */
export const getPrComments = async (
  prNumber: string,
): Promise<ExistingCommentThread[]> => {
  const allThreads = await fetchAllThreadsWithComments(prNumber);

  const commentThreads: ExistingCommentThread[] = [];

  for (const thread of allThreads) {
    const comments = thread.comments.nodes;

    const rootComment = comments.find((comment) => comment.replyTo === null);

    if (!rootComment) {
      throw new Error("No root comment found");
    }

    const originalAuthor = rootComment.author.login;

    const replies = comments.filter(
      (comment) => comment.replyTo?.id === rootComment.id,
    );

    replies.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    const lastReply = replies[replies.length - 1];

    const aiCreated = originalAuthor === "hashdotai";

    const nonAiLastComment = lastReply
      ? lastReply.author.login !== "hashdotai"
      : originalAuthor !== "hashdotai";

    commentThreads.push({
      threadId: rootComment.databaseId,
      isResolved: thread.isResolved,
      requiresAiResponse:
        nonAiLastComment && !thread.isResolved
          ? aiCreated || rootComment.body.includes("@hashdotai")
            ? "yes"
            : "maybe"
          : "no",
      author: aiCreated ? "you" : originalAuthor,
      body: rootComment.body,
      path: rootComment.path,
      position: rootComment.position,
      replies: replies.map((reply) => ({
        body: reply.body,
        author: reply.author.login === "hashdotai" ? "you" : reply.author.login,
        createdAt: reply.createdAt,
      })),
    });
  }

  return commentThreads;
};

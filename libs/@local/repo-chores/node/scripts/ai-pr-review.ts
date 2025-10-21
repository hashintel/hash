#!/usr/bin/env node

import { Anthropic } from "@anthropic-ai/sdk";
import { LinearClient } from "@linear/sdk";
import chalk from "chalk";
import { config } from "dotenv-flow";
import { execa } from "execa";
import type { z } from "zod";

import { addLineNumbersToDiff } from "./ai-pr-review/add-diff-line-numbers";
import {
  type CommentReplySchema,
  generateCommentReplies,
} from "./ai-pr-review/generate-comment-replies";
import {
  generatePRReview,
  type PRReviewSchema,
  type TodoItemSchema,
} from "./ai-pr-review/generate-pr-review";
import { getPrComments } from "./ai-pr-review/get-pr-comments";
import {
  extractLinearTicketIds,
  fetchLinearTickets,
  getPRDiff,
  getPROverview,
} from "./ai-pr-review/get-pr-info";
import { sleep } from "./shared/time";

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
    } catch {
      console.error(chalk.red("Error creating Linear issue"));
    }
  }

  return createdTicketIds;
};

const postCommentReplies = async ({
  prNumber,
  commentReplies,
}: {
  prNumber: string;
  commentReplies: z.infer<typeof CommentReplySchema>[];
}): Promise<number> => {
  await Promise.all(
    commentReplies.map(async (reply) => {
      await execa("gh", [
        "api",
        "--method",
        "POST",
        "-H",
        "Accept: application/vnd.github+json",
        "-H",
        "X-GitHub-Api-Version: 2022-11-28",
        `/repos/{owner}/{repo}/pulls/${prNumber}/comments/${reply.threadId}/replies`,
        "-f",
        `body=${reply.comment}`,
      ]);
    }),
  );

  return commentReplies.length;
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
    const { generalReview, diffComments, ticketTodos } = prReview;

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
  } catch {
    console.error(chalk.red("Error submitting PR review"));
  }
};

const processReviewResults = async (
  prNumber: string,
  review: z.infer<typeof PRReviewSchema>,
): Promise<void> => {
  const createdTicketIds = await createLinearIssues(review.ticketTodos ?? null);

  await submitPRReview({
    prNumber,
    prReview: review,
    createdTicketIds,
  });
};

/**
 * Main function for the AI PR review process
 *
 * NOTE: This script is designed to run with a concurrency limit in GitHub Actions
 * to prevent multiple instances from running simultaneously on the same PR.
 * The concurrency configuration in `.github/workflows/ai-pr-review.yml` ensures:
 *   1. Only one review process runs at a time per PR
 *   2. Reviews complete before new ones start on the same PR
 *   3. Reviews capture the state of the PR at the time they were requested
 */
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

  const prOverview = await getPROverview(prNumber);

  const unnumberedPrDiff = await getPRDiff(prNumber);
  const prDiff = addLineNumbersToDiff(unnumberedPrDiff);

  const linearTicketIds = await extractLinearTicketIds(anthropic, prOverview);

  if (linearTicketIds.length === 0) {
    console.log(chalk.red("No Linear ticket IDs found in PR title"));
    process.exit(1);
  } else {
    console.log(
      chalk.green(`Found Linear ticket IDs: ${linearTicketIds.join(", ")}`),
    );
  }

  const preReplyCommentThreads = await getPrComments(prNumber);

  const linearTickets = await fetchLinearTickets(linear, linearTicketIds);

  const commentReplies = await generateCommentReplies({
    anthropic,
    commentThreads: preReplyCommentThreads,
    linearTickets,
    prDiff,
    prOverview,
    previousErrors: null,
  });

  const countOfRepliesPosted = await postCommentReplies({
    prNumber,
    commentReplies,
  });

  if (countOfRepliesPosted > 0) {
    console.log(
      chalk.green(`Submitted ${commentReplies.length} comment replies`),
    );

    /**
     * Wait a couple of seconds in case the comment replies are not consistently available immediately from the API after posting them.
     *
     * I don't know if this is a real issue in practice, but it's simpler than
     * (1) stress testing to check if they are ever actually missing, or
     * (2) merging the AI's comment replies with the existing comments to avoid needing to refetch.
     *
     * If this delay becomes a problem we can do one of those.
     */
    await sleep(2_000);
  }

  const commentThreads =
    countOfRepliesPosted > 0
      ? /**
         * Refetch comment threads if the AI added any replies
         */
        await getPrComments(prNumber)
      : preReplyCommentThreads;

  console.log(chalk.blue("Generating PR review..."));

  const review = await generatePRReview({
    anthropic,
    commentThreads,
    prDiff,
    prOverview,
    linearTickets,
    previousErrors: null,
  });

  console.log(
    chalk.green("AI review successfully generated, posting results..."),
    JSON.stringify(review, null, 2),
  );

  await processReviewResults(prNumber, review);

  console.log(chalk.green("PR review completed successfully!"));
};

main().catch(() => {
  console.error(chalk.red("Unhandled error"));
  process.exit(1);
});

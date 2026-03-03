import type { Comment, Issue } from "@linear/sdk";

export type HydratedLinearComment = {
  id: string;
  text: string;
  createdAt: Date;
  data: string;
  author: {
    tag: string;
    name: string;
    userId: string;
  } | null;
  replies: HydratedLinearComment[];
};

/**
 * Hydrate key information about a Linear comment.
 *
 * @param {Comment} comment - The Linear comment to hydrate.
 * @returns {HydratedLinearComment}
 */
const hydrateComment = async (
  comment: Comment,
): Promise<HydratedLinearComment> => {
  const [author, children] = await Promise.all([
    comment.user,
    comment.children(),
  ]);

  return {
    id: comment.id,
    text: comment.body,
    data: (comment as unknown as { bodyData: string }).bodyData, // The field is internal
    createdAt: comment.createdAt,
    author: author
      ? {
          tag: author.displayName,
          name: author.name,
          userId: author.id,
        }
      : null,
    replies: await Promise.all(
      children.nodes
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map(hydrateComment),
    ),
  };
};

export type HydratedLinearIssue = {
  id: string;
  uuid: string;
  title: string;
  teamId?: string;
  description?: string;
  priority?: string;
  assignee: {
    tag: string;
    name: string;
    userId: string;
  } | null;
  state?: string;
  comments?: HydratedLinearComment[];
};

/**
 * Retrieve key information about a Linear issue.
 *
 * @param {Issue} issue - The Linear issue to hydrate.
 * @param {boolean} includeComments - Whether to include comments (threaded) in the returned issue.
 *
 * @returns {HydratedLinearIssue}
 */
export const hydrateLinearIssue = async ({
  issue,
  includeComments = false,
}: {
  issue: Issue;
  includeComments?: boolean;
}): Promise<HydratedLinearIssue> => {
  const [assignee, commentList, state] = await Promise.all([
    issue.assignee,
    includeComments ? issue.comments() : Promise.resolve({ nodes: [] }),
    issue.state,
  ]);

  const rootComments = commentList.nodes
    .filter((comment) => !comment.parent)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const comments = await Promise.all(
    rootComments.map((comment) => hydrateComment(comment)),
  );

  let priority: string | undefined;
  switch (issue.priority) {
    case 1:
      priority = "Urgent";
      break;
    case 2:
      priority = "High";
      break;
    case 3:
      priority = "Normal";
      break;
    case 4:
      priority = "Low";
      break;
    default:
      priority = undefined;
  }

  const team = await issue.team;

  return {
    id: issue.identifier,
    uuid: issue.id,
    title: issue.title,
    teamId: team?.id,
    description: issue.description,
    priority,
    assignee: assignee
      ? {
          tag: assignee.displayName,
          name: assignee.name,
          userId: assignee.id,
        }
      : null,
    state: state?.name,
    comments: includeComments ? comments : undefined,
  };
};

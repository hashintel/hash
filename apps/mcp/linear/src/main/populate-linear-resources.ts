import type { Comment, Issue } from "@linear/sdk";

type HydratedComment = {
  id: string;
  text: string;
  createdAt: Date;
  data: string;
  author: {
    tag: string;
    name: string;
    userId: string;
  } | null;
  replies: HydratedComment[];
};

const hydrateComment = async (comment: Comment): Promise<HydratedComment> => {
  const [author, children] = await Promise.all([
    comment.user,
    comment.children(),
  ]);

  return {
    id: comment.id,
    text: comment.body,
    data: comment.bodyData,
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
        .map(hydrateComment)
    ),
  };
};

type HydratedIssue = {
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
  comments?: HydratedComment[];
};

export const hydrateIssue = async ({
  issue,
  includeComments = false,
}: {
  issue: Issue;
  includeComments?: boolean;
}): Promise<HydratedIssue> => {
  const [assignee, commentList, state] = await Promise.all([
    issue.assignee,
    includeComments ? issue.comments() : Promise.resolve({ nodes: [] }),
    issue.state,
  ]);

  const rootComments = commentList.nodes
    .filter((comment) => !comment.parent)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const comments = await Promise.all(
    rootComments.map((comment) => hydrateComment(comment))
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

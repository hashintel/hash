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
        .map(hydrateComment),
    ),
  };
};

type HydratedIssue = {
  id: string;
  title: string;
  description?: string;
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
    rootComments.map((comment) => hydrateComment(comment)),
  );

  return {
    id: issue.identifier,
    title: issue.title,
    description: issue.description,
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

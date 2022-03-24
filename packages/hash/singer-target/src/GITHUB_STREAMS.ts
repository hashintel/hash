import { AnyStreamsConfig } from "./target-org/createTargetOrg";

export const GITHUB_STREAMS: AnyStreamsConfig = {
  issues: {
    entityTypeTitle: "GithubIssue",
    keyProperties: ["id"],
  },
  pull_requests: {
    entityTypeTitle: "GithubPullRequest",
    keyProperties: ["id"],
  },
};

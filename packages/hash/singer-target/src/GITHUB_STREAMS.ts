import { AnyStreamsConfig } from "./target-org/createTargetOrg";

export const GITHUB_STREAMS: AnyStreamsConfig = {
  issues: {
    entityTypeTitle: "GithubIssue",
    keyProperties: ["id"],
    links: {
      // `$.pullRequest`
      pullRequest: {
        destinationTypeTitle: "GithubPullRequest",
        extract(record) {
          if (typeof record.pull_request?.url === "string") {
            return [
              {
                whereEq: { url: record.pull_request.url },
              },
            ];
          } else {
            return [];
          }
        },
      },
      /**
       *
       *
       * On path = `$.hasComments`
       */
      hasComments: {
        destinationTypeTitle: "GithubComment",
        extract(record) {
          // TODO: How do we want to allow whereEq to return multiple matches?
          return [
            {
              whereEq: { issue_url: record.url },
            },
          ];
        },
      },
      // TODO: GithubLabels EntityType
      // TODO: GithubRepository EntityType
      // inRepository: {
      //   destinationTypeTitle: "GithubRepository",
      //   extract(record) {
      //     return [{ whereEq: {url: record.repository_url }}]
      //   }
      // }
    },
  },
  pull_requests: {
    entityTypeTitle: "GithubPullRequest",
    keyProperties: ["id"],
    links: {
      // TODO: GithubUser EntityType
      // byUser: {
      //   destinationTypeTitle: "GithubUser",
      //   extract(record) {
      //     return [{ whereEq: {id: record.user.id }}]
      //   }
      // },
      // TODO: GithubLabel EntityType
      // TODO: GithubRepository EntityType
      // inRepository: {
      //   destinationTypeTitle: "GithubRepository",
      //   extract(record) {
      //     return [{ whereEq: {id: record.base.repo.id }}]
      //   }
      // }
      issue: {
        destinationTypeTitle: "GithubIssue",
        extract(record) {
          return [
            {
              whereEq: {
                number: record.number,
                repository_url: record.base.repo.url,
              },
            },
          ];
        },
      },
    },
  },
  comments: {
    // These are Issue comments and also Pull-Request comments, see top-level description on:
    // https://docs.github.com/en/rest/reference/pulls#review-comments
    entityTypeTitle: "GithubComment",
    keyProperties: ["id"],
    links: {
      onIssue: {
        destinationTypeTitle: "GithubIssue",
        extract(record) {
          //example: "https://api.github.com/repos/khonsulabs/bonsaidb/issues/5"
          return [{ whereEq: { url: record.issue_url } }];
        },
      },
      // TODO: GithubUser EntityType
      // byUser: {
      //   destinationTypeTitle: "GithubUser",
      //   extract(record) {
      //     return [{ whereEq: {id: record.user.id }}]
      //   }
      // },
    },
  },
};

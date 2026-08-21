"use strict";

const DataLoader = require("dataloader");

const validRepoNameRegex = /^[\w.-]+\/[\w.-]+$/;

const pullRequestFields = `
  number
  url
  mergedAt
  author {
    login
    url
  }
  assignees(first: 1) {
    nodes {
      login
      url
    }
  }
`;

const makeQuery = (repos) => `
  query {
    ${Object.keys(repos)
      .map(
        (repo, index) => `a${index}: repository(
          owner: ${JSON.stringify(repo.split("/")[0])}
          name: ${JSON.stringify(repo.split("/")[1])}
        ) {
          ${repos[repo]
            .map((request) =>
              request.kind === "commit"
                ? `a${request.commit}: object(expression: ${JSON.stringify(
                    request.commit,
                  )}) {
                    ... on Commit {
                      associatedPullRequests(first: 50) {
                        nodes {
                          ${pullRequestFields}
                        }
                      }
                      author {
                        user {
                          login
                          url
                        }
                      }
                    }
                  }`
                : `pr__${request.pull}: pullRequest(number: ${request.pull}) {
                    ${pullRequestFields}
                  }`,
            )
            .join("\n")}
        }`,
      )
      .join("\n")}
  }
`;

/**
 * A release asks about the same commit once per package it appears in, all
 * within one tick, so batching and caching collapse that to a single request.
 */
const loader = new DataLoader(
  async (requests) => {
    if (!process.env.GITHUB_TOKEN) {
      throw new Error(
        "GITHUB_TOKEN is unset. Create a GitHub personal access token at https://github.com/settings/tokens/new with `read:user` and `repo:status` permissions and expose it as GITHUB_TOKEN",
      );
    }

    const repos = {};
    for (const { repo, ...request } of requests) {
      repos[repo] ??= [];
      repos[repo].push(request);
    }

    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: { Authorization: `Token ${process.env.GITHUB_TOKEN}` },
      body: JSON.stringify({ query: makeQuery(repos) }),
    });
    const body = await response.json();

    if (body.errors) {
      throw new Error(
        `GitHub returned errors for the changelog query\n${JSON.stringify(body.errors, null, 2)}`,
      );
    }

    if (!body.data) {
      throw new Error(
        `GitHub returned no data for the changelog query\n${JSON.stringify(body)}`,
      );
    }

    const byRepo = {};
    Object.keys(repos).forEach((repo, index) => {
      const entries = { commit: {}, pull: {} };
      byRepo[repo] = entries;

      for (const [alias, value] of Object.entries(
        body.data[`a${index}`] ?? {},
      )) {
        if (alias.startsWith("pr__")) {
          entries.pull[alias.slice("pr__".length)] = value;
        } else {
          entries.commit[alias.slice(1)] = value;
        }
      }
    });

    return requests.map(({ repo, kind, commit, pull }) =>
      kind === "commit" ? byRepo[repo].commit[commit] : byRepo[repo].pull[pull],
    );
  },
  { cacheKeyFn: (request) => JSON.stringify(request) },
);

const assertValidRepo = (repo) => {
  if (!validRepoNameRegex.test(repo)) {
    throw new Error(
      `The repo "${repo}" is not of the form userOrOrg/repoName, which must match ${validRepoNameRegex.source}`,
    );
  }
};

/**
 * A pull request's author is sometimes an agent or a bot; its assignee is a
 * person.
 */
const attributablePerson = (pullRequest) =>
  pullRequest?.assignees?.nodes?.[0] ?? pullRequest?.author ?? null;

/**
 * Picks the same pull request out of a commit's associated set as
 * `@changesets/changelog-github` does.
 *
 * @see https://github.com/changesets/changesets/blob/main/packages/get-github-info/src/index.ts
 */
const primaryPullRequest = (nodes) =>
  [...nodes].sort((left, right) => {
    if (left.mergedAt === null && right.mergedAt === null) {
      return 0;
    }
    if (left.mergedAt === null) {
      return 1;
    }
    if (right.mergedAt === null) {
      return -1;
    }
    return (
      new Date(left.mergedAt).getTime() - new Date(right.mergedAt).getTime()
    );
  })[0];

const getInfoFromCommit = async ({ repo, commit }) => {
  assertValidRepo(repo);

  const data = await loader.load({ kind: "commit", repo, commit });
  const nodes = data?.associatedPullRequests?.nodes ?? [];
  const pullRequest = nodes.length > 0 ? primaryPullRequest(nodes) : null;

  return {
    person: pullRequest
      ? attributablePerson(pullRequest)
      : (data?.author?.user ?? null),
    pull: pullRequest
      ? { number: pullRequest.number, url: pullRequest.url }
      : null,
  };
};

const getInfoFromPullRequest = async ({ repo, pull }) => {
  assertValidRepo(repo);

  const data = await loader.load({ kind: "pull", repo, pull });

  return {
    person: attributablePerson(data),
    pull: { number: pull, url: `https://github.com/${repo}/pull/${pull}` },
  };
};

module.exports = { getInfoFromCommit, getInfoFromPullRequest };

"use strict";

const DataLoader = require("dataloader");

const validRepoNameRegex = /^[\w.-]+\/[\w.-]+$/;

const pullRequestFields = `
  number
  url
  mergedAt
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
            .map(
              (
                commit,
              ) => `a${commit}: object(expression: ${JSON.stringify(commit)}) {
                ... on Commit {
                  associatedPullRequests(first: 50) {
                    nodes {
                      ${pullRequestFields}
                    }
                  }
                }
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
        "GITHUB_TOKEN is unset. Set GITHUB_TOKEN to a token with read access to the repository to resolve changelog pull request links",
      );
    }

    const repos = {};
    for (const { repo, commit } of requests) {
      repos[repo] ??= [];
      repos[repo].push(commit);
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
      byRepo[repo] = body.data[`a${index}`] ?? {};
    });

    return requests.map(({ repo, commit }) => byRepo[repo][`a${commit}`]);
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

  const data = await loader.load({ repo, commit });
  const nodes = data?.associatedPullRequests?.nodes ?? [];
  const pullRequest = nodes.length > 0 ? primaryPullRequest(nodes) : null;

  return {
    pull: pullRequest
      ? { number: pullRequest.number, url: pullRequest.url }
      : null,
  };
};

const getInfoFromPullRequest = ({ repo, pull }) => {
  assertValidRepo(repo);

  return {
    pull: { number: pull, url: `https://github.com/${repo}/pull/${pull}` },
  };
};

module.exports = { getInfoFromCommit, getInfoFromPullRequest };

"use strict";

const { getInfoFromCommit, getInfoFromPullRequest } = require("./github.cjs");

const assertRepo = (options) => {
  if (!options?.repo) {
    throw new Error(
      'The `repo` option is unset. Set it in `.changeset/config.json` as "changelog": ["@local/repo-chores/changesets-changelog", { "repo": "org/repo" }]',
    );
  }
};

/**
 * Reads the `pr`, `commit` and `author` keys `@changesets/changelog-github`
 * accepts at the head of a changeset summary, and strips them from the text.
 *
 * @see https://github.com/changesets/changesets/blob/main/packages/changelog-github/src/index.ts
 */
const takeOverrides = (summary) => {
  let pull;
  let commit;
  const logins = [];

  const description = summary
    .replace(/^\s*(?:pr|pull|pull\s+request):\s*#?(\d+)/im, (_match, value) => {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
        pull = parsed;
      }
      return "";
    })
    .replace(/^\s*commit:\s*(\S+)/im, (_match, value) => {
      commit = value;
      return "";
    })
    .replace(/^\s*(?:author|user):\s*@?(\S+)/gim, (_match, value) => {
      logins.push(value);
      return "";
    })
    .trim();

  return { pull, commit, logins, description };
};

/**
 * The GraphQL payload carries each person's own URL, which for an app author is
 * `https://github.com/apps/<slug>` rather than a profile under its login. The
 * frontmatter override keys give a bare login, so build the profile URL only
 * for those.
 */
const personLink = ({ login, url }) =>
  `[@${login}](${url ?? `https://github.com/${login}`})`;

const getReleaseLine = async (changeset, _type, options) => {
  assertRepo(options);

  const { repo } = options;
  const { pull, commit, logins, description } = takeOverrides(
    changeset.summary,
  );

  const info = await (async () => {
    if (pull !== undefined) {
      return getInfoFromPullRequest({ repo, pull });
    }

    const target = commit ?? changeset.commit;

    return target
      ? getInfoFromCommit({ repo, commit: target })
      : { person: null, pull: null };
  })();

  const resolvedPeople = info.person ? [info.person] : [];
  const attributedPeople =
    logins.length > 0 ? logins.map((login) => ({ login })) : resolvedPeople;

  const attribution = [
    ...(attributedPeople.length > 0
      ? [attributedPeople.map(personLink).join(", ")]
      : []),
    ...(info.pull ? [`[#${info.pull.number}](${info.pull.url})`] : []),
  ];

  const suffix = attribution.length > 0 ? ` (${attribution.join(", ")})` : "";

  const lines = description.split("\n").map((line) => line.trimEnd());
  const breakIndex = lines.findIndex((line, index) => index > 0 && line === "");
  const opening = breakIndex === -1 ? lines : lines.slice(0, breakIndex);
  const remainder = breakIndex === -1 ? [] : lines.slice(breakIndex);

  const entry = [
    `- ${opening.join("\n  ")}${suffix}`,
    ...remainder.map((line) => (line === "" ? "" : `  ${line}`)),
  ].join("\n");

  return `\n\n${entry}\n`;
};

const getDependencyReleaseLine = async (
  _changesets,
  dependenciesUpdated,
  options,
) => {
  assertRepo(options);

  if (dependenciesUpdated.length === 0) {
    return "";
  }

  return [
    "- Updated dependencies:",
    ...dependenciesUpdated.map(
      (dependency) => `  - ${dependency.name}@${dependency.newVersion}`,
    ),
  ].join("\n");
};

module.exports = { getReleaseLine, getDependencyReleaseLine };

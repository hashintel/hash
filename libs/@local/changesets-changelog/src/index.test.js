import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDependencyReleaseLine, getReleaseLine } from "./index.js";

const repo = "hashintel/hash";
const options = { repo };

const person = (login) => ({ login, url: `https://github.com/${login}` });

const pullRequest = ({ number, author, assignees = [], mergedAt = null }) => ({
  number,
  url: `https://github.com/${repo}/pull/${number}`,
  mergedAt,
  author: author === null ? null : person(author),
  assignees: { nodes: assignees.map(person) },
});

/**
 * Answers the batched GraphQL query the loader sends, keying commits and pull
 * requests by the aliases it builds for them.
 */
const respondWith = ({ commits = {}, pulls = {} }) => {
  const repository = {};

  for (const [commit, value] of Object.entries(commits)) {
    repository[`a${commit}`] = value;
  }
  for (const [pull, value] of Object.entries(pulls)) {
    repository[`pr__${pull}`] = value;
  }

  return vi.fn(async () => ({
    json: async () => ({ data: { a0: repository } }),
  }));
};

const commitOf = ({ pulls = [], author = null }) => ({
  associatedPullRequests: { nodes: pulls },
  author: author === null ? null : { user: person(author) },
});

let fetchMock;

beforeEach(() => {
  vi.stubEnv("GITHUB_TOKEN", "token");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const releaseLine = async (summary, commit) =>
  getReleaseLine({ summary, commit, releases: [] }, "patch", options);

describe("getReleaseLine", () => {
  it("attributes the entry to the pull request's assignee", async () => {
    fetchMock.mockImplementation(
      respondWith({
        commits: {
          aaaaaa1: commitOf({
            pulls: [
              pullRequest({
                number: 8750,
                author: "some-bot",
                assignees: ["CiaranMn"],
                mergedAt: "2026-08-01T00:00:00Z",
              }),
            ],
            author: "some-bot",
          }),
        },
      }),
    );

    await expect(
      releaseLine("add arrow-right-arrow-left icon", "aaaaaa1"),
    ).resolves.toBe(
      "\n\n- add arrow-right-arrow-left icon ([@CiaranMn](https://github.com/CiaranMn), [#8750](https://github.com/hashintel/hash/pull/8750))\n",
    );
  });

  it("falls back to the pull request author when there is no assignee", async () => {
    fetchMock.mockImplementation(
      respondWith({
        commits: {
          aaaaaa2: commitOf({
            pulls: [
              pullRequest({
                number: 8751,
                author: "CiaranMn",
                mergedAt: "2026-08-01T00:00:00Z",
              }),
            ],
          }),
        },
      }),
    );

    await expect(releaseLine("tidy up types", "aaaaaa2")).resolves.toBe(
      "\n\n- tidy up types ([@CiaranMn](https://github.com/CiaranMn), [#8751](https://github.com/hashintel/hash/pull/8751))\n",
    );
  });

  it("prefers a human assignee over a bot author", async () => {
    fetchMock.mockImplementation(
      respondWith({
        commits: {
          aaaaaa3: commitOf({
            pulls: [
              pullRequest({
                number: 8752,
                author: "renovate[bot]",
                assignees: ["indietyp"],
                mergedAt: "2026-08-01T00:00:00Z",
              }),
            ],
            author: "renovate[bot]",
          }),
        },
      }),
    );

    await expect(releaseLine("bump a dependency", "aaaaaa3")).resolves.toBe(
      "\n\n- bump a dependency ([@indietyp](https://github.com/indietyp), [#8752](https://github.com/hashintel/hash/pull/8752))\n",
    );
  });

  it("uses the first of several assignees", async () => {
    fetchMock.mockImplementation(
      respondWith({
        commits: {
          aaaaaa4: commitOf({
            pulls: [
              pullRequest({
                number: 8753,
                author: "some-bot",
                assignees: ["CiaranMn", "indietyp"],
                mergedAt: "2026-08-01T00:00:00Z",
              }),
            ],
          }),
        },
      }),
    );

    await expect(releaseLine("rework the sidebar", "aaaaaa4")).resolves.toBe(
      "\n\n- rework the sidebar ([@CiaranMn](https://github.com/CiaranMn), [#8753](https://github.com/hashintel/hash/pull/8753))\n",
    );
  });

  it("attributes the commit author when no pull request is associated", async () => {
    fetchMock.mockImplementation(
      respondWith({
        commits: { aaaaaa5: commitOf({ pulls: [], author: "CiaranMn" }) },
      }),
    );

    await expect(releaseLine("hotfix the build", "aaaaaa5")).resolves.toBe(
      "\n\n- hotfix the build ([@CiaranMn](https://github.com/CiaranMn))\n",
    );
  });

  it("emits the description alone when neither person nor pull request is known", async () => {
    fetchMock.mockImplementation(
      respondWith({ commits: { aaaaaa6: commitOf({}) } }),
    );

    await expect(releaseLine("hotfix the build", "aaaaaa6")).resolves.toBe(
      "\n\n- hotfix the build\n",
    );
  });

  it("makes no request for a changeset with no commit", async () => {
    await expect(releaseLine("written by hand", undefined)).resolves.toBe(
      "\n\n- written by hand\n",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("closes the first paragraph of a multi-paragraph description", async () => {
    fetchMock.mockImplementation(
      respondWith({
        commits: {
          aaaaaa7: commitOf({
            pulls: [
              pullRequest({
                number: 8754,
                author: "some-bot",
                assignees: ["CiaranMn"],
                mergedAt: "2026-08-01T00:00:00Z",
              }),
            ],
          }),
        },
      }),
    );

    await expect(
      releaseLine(
        "rework entity editing\nacross both panes\n\nMigrations run automatically.\n\nSee the docs.",
        "aaaaaa7",
      ),
    ).resolves.toBe(
      [
        "",
        "",
        "- rework entity editing",
        "  across both panes ([@CiaranMn](https://github.com/CiaranMn), [#8754](https://github.com/hashintel/hash/pull/8754))",
        "",
        "  Migrations run automatically.",
        "",
        "  See the docs.",
        "",
      ].join("\n"),
    );
  });

  it("honours the pr and author keys in the changeset frontmatter", async () => {
    fetchMock.mockImplementation(
      respondWith({
        pulls: {
          9001: pullRequest({ number: 9001, author: "ignored-author" }),
        },
      }),
    );

    await expect(
      releaseLine("pr: 9001\nauthor: @nonbinaryunicorn\n\nrename a field"),
    ).resolves.toBe(
      "\n\n- rename a field ([@nonbinaryunicorn](https://github.com/nonbinaryunicorn), [#9001](https://github.com/hashintel/hash/pull/9001))\n",
    );
  });

  it("resolves the pr key against the pull request's assignee", async () => {
    fetchMock.mockImplementation(
      respondWith({
        pulls: {
          9002: pullRequest({
            number: 9002,
            author: "some-bot",
            assignees: ["CiaranMn"],
          }),
        },
      }),
    );

    await expect(releaseLine("pr: 9002\n\nrename a field")).resolves.toBe(
      "\n\n- rename a field ([@CiaranMn](https://github.com/CiaranMn), [#9002](https://github.com/hashintel/hash/pull/9002))\n",
    );
  });

  it("looks the commit key up in place of the changeset's own commit", async () => {
    fetchMock.mockImplementation(
      respondWith({
        commits: {
          bbbbbb1: commitOf({
            pulls: [
              pullRequest({
                number: 8760,
                author: "some-bot",
                assignees: ["CiaranMn"],
                mergedAt: "2026-08-01T00:00:00Z",
              }),
            ],
          }),
        },
      }),
    );

    await expect(
      releaseLine("commit: bbbbbb1\n\nreplace the icon set", "aaaaaa9"),
    ).resolves.toBe(
      "\n\n- replace the icon set ([@CiaranMn](https://github.com/CiaranMn), [#8760](https://github.com/hashintel/hash/pull/8760))\n",
    );
  });

  it("rejects when no repo is configured", async () => {
    await expect(
      getReleaseLine({ summary: "a change", releases: [] }, "patch", {}),
    ).rejects.toThrow("The `repo` option is unset");
  });

  it("rejects when GITHUB_TOKEN is unset", async () => {
    vi.stubEnv("GITHUB_TOKEN", "");

    await expect(releaseLine("a change", "cccccc1")).rejects.toThrow(
      "GITHUB_TOKEN is unset",
    );
  });
});

describe("getDependencyReleaseLine", () => {
  it("lists the updated dependencies without commit links", async () => {
    await expect(
      getDependencyReleaseLine(
        [{ commit: "aaaaaa1" }],
        [
          { name: "@hashintel/design-system", newVersion: "1.2.0" },
          { name: "@hashintel/type-editor", newVersion: "0.4.1" },
        ],
        options,
      ),
    ).resolves.toBe(
      [
        "- Updated dependencies:",
        "  - @hashintel/design-system@1.2.0",
        "  - @hashintel/type-editor@0.4.1",
      ].join("\n"),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns nothing when no dependency was updated", async () => {
    await expect(
      getDependencyReleaseLine([{ commit: "aaaaaa1" }], [], options),
    ).resolves.toBe("");
  });

  it("rejects when no repo is configured", async () => {
    await expect(
      getDependencyReleaseLine([], [{ name: "a", newVersion: "1.0.0" }], {}),
    ).rejects.toThrow("The `repo` option is unset");
  });
});

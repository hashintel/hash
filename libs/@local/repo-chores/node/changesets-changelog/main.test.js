import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDependencyReleaseLine, getReleaseLine } from "./main.cjs";

const repo = "hashintel/hash";
const options = { repo };

const person = (login, url = `https://github.com/${login}`) => ({
  login,
  url,
});

/** A test may pass either a bare login or an explicit `{ login, url }` pair. */
const asPerson = (value) =>
  typeof value === "string" ? person(value) : person(value.login, value.url);

const pullRequest = ({ number, author, assignees = [], mergedAt = null }) => ({
  number,
  url: `https://github.com/${repo}/pull/${number}`,
  mergedAt,
  author: author === null ? null : asPerson(author),
  assignees: { nodes: assignees.map(asPerson) },
});

/**
 * Answers the batched GraphQL query the loader sends, keying commits and pull
 * requests by the aliases it builds for them.
 */
const respondWith = ({ commits = {} }) => {
  const repository = {};

  for (const [commit, value] of Object.entries(commits)) {
    repository[`a${commit}`] = value;
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
  it("links the pull request without crediting its assignee or author", async () => {
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
      "\n\n- add arrow-right-arrow-left icon ([#8750](https://github.com/hashintel/hash/pull/8750))\n",
    );
    const [{ body }] = fetchMock.mock.calls.map(([, request]) => request);
    const { query } = JSON.parse(body);
    expect(query).toContain("associatedPullRequests");
    expect(query).not.toMatch(/\b(?:author|assignees|login)\b/);
  });

  it("emits no credit when only the commit author is known", async () => {
    fetchMock.mockImplementation(
      respondWith({
        commits: { aaaaaa5: commitOf({ pulls: [], author: "CiaranMn" }) },
      }),
    );

    await expect(releaseLine("hotfix the build", "aaaaaa5")).resolves.toBe(
      "\n\n- hotfix the build\n",
    );
  });

  it("emits the description alone when no pull request is known", async () => {
    fetchMock.mockImplementation(
      respondWith({ commits: { aaaaaa6: commitOf({}) } }),
    );

    await expect(releaseLine("hotfix the build", "aaaaaa6")).resolves.toBe(
      "\n\n- hotfix the build\n",
    );
  });

  it("strips legacy author and user keys without adding credits", async () => {
    fetchMock.mockImplementation(
      respondWith({
        commits: {
          aaaaab3: commitOf({
            pulls: [
              pullRequest({
                number: 8570,
                author: {
                  login: "hash-worker",
                  url: "https://github.com/apps/hash-worker",
                },
                mergedAt: "2026-08-01T00:00:00Z",
              }),
            ],
          }),
        },
      }),
    );

    await expect(
      releaseLine(
        "author: @nonbinaryunicorn\nuser: @another-person\n\nrename a field",
        "aaaaab3",
      ),
    ).resolves.toBe(
      "\n\n- rename a field ([#8570](https://github.com/hashintel/hash/pull/8570))\n",
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
        "  across both panes ([#8754](https://github.com/hashintel/hash/pull/8754))",
        "",
        "  Migrations run automatically.",
        "",
        "  See the docs.",
        "",
      ].join("\n"),
    );
  });

  it("honours the pr override while ignoring legacy author keys", async () => {
    await expect(
      releaseLine(
        "pr: 9001\nauthor: @nonbinaryunicorn\nuser: @another-person\n\nrename a field",
      ),
    ).resolves.toBe(
      "\n\n- rename a field ([#9001](https://github.com/hashintel/hash/pull/9001))\n",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses an explicit pr without a GitHub token or request", async () => {
    vi.stubEnv("GITHUB_TOKEN", "");

    await expect(releaseLine("pr: 9002\n\nrename a field")).resolves.toBe(
      "\n\n- rename a field ([#9002](https://github.com/hashintel/hash/pull/9002))\n",
    );
    expect(fetchMock).not.toHaveBeenCalled();
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
      "\n\n- replace the icon set ([#8760](https://github.com/hashintel/hash/pull/8760))\n",
    );
  });

  it("rejects when no repo is configured", async () => {
    await expect(
      getReleaseLine({ summary: "a change", releases: [] }, "patch", {}),
    ).rejects.toThrow("The `repo` option is unset");
  });

  it("batches different commits and reuses the lookup across packages", async () => {
    fetchMock.mockImplementation(
      respondWith({
        commits: {
          dddddd1: commitOf({
            pulls: [pullRequest({ number: 9003, author: null })],
          }),
          dddddd2: commitOf({
            pulls: [pullRequest({ number: 9004, author: null })],
          }),
        },
      }),
    );

    await expect(
      Promise.all([
        releaseLine("first package", "dddddd1"),
        releaseLine("second package", "dddddd2"),
        releaseLine("third package", "dddddd1"),
      ]),
    ).resolves.toEqual([
      "\n\n- first package ([#9003](https://github.com/hashintel/hash/pull/9003))\n",
      "\n\n- second package ([#9004](https://github.com/hashintel/hash/pull/9004))\n",
      "\n\n- third package ([#9003](https://github.com/hashintel/hash/pull/9003))\n",
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("keeps the earliest merged pull request when a commit has several", async () => {
    fetchMock.mockImplementation(
      respondWith({
        commits: {
          eeeeee1: commitOf({
            pulls: [
              pullRequest({ number: 9005, author: null }),
              pullRequest({
                number: 9006,
                author: null,
                mergedAt: "2026-08-02T00:00:00Z",
              }),
              pullRequest({
                number: 9007,
                author: null,
                mergedAt: "2026-08-01T00:00:00Z",
              }),
            ],
          }),
        },
      }),
    );

    await expect(releaseLine("a shared commit", "eeeeee1")).resolves.toBe(
      "\n\n- a shared commit ([#9007](https://github.com/hashintel/hash/pull/9007))\n",
    );
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

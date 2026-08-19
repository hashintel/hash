import { describe, expect, it } from "vitest";

import { resolveSourceRef, resolveSourceUrlPrefix } from "./source-url";

describe("resolveSourceRef", () => {
  it("falls back to `main` when the environment names no ref", () => {
    expect(resolveSourceRef({})).toBe("main");
  });

  it("ignores a variable that is set but empty", () => {
    expect(resolveSourceRef({ GITHUB_SHA: "  " })).toBe("main");
  });

  it("prefers a commit SHA over a branch name", () => {
    expect(
      resolveSourceRef({
        GITHUB_HEAD_REF: "cf/fe-1457-x",
        GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
      }),
    ).toBe("0123456789abcdef0123456789abcdef01234567");

    expect(
      resolveSourceRef({
        VERCEL_GIT_COMMIT_REF: "cf/fe-1457-x",
        VERCEL_GIT_COMMIT_SHA: "89abcdef",
      }),
    ).toBe("89abcdef");
  });

  it("prefers the explicit override over anything the CI provides", () => {
    expect(
      resolveSourceRef({
        GITHUB_SHA: "0123456789abcdef",
        PETRINAUT_ARCH_DOCS_SOURCE_REF: "my-local-branch",
        VERCEL_GIT_COMMIT_SHA: "89abcdef",
      }),
    ).toBe("my-local-branch");
  });

  it("takes a branch name when no SHA is present", () => {
    expect(resolveSourceRef({ GITHUB_REF_NAME: "main" })).toBe("main");
    expect(resolveSourceRef({ GITHUB_HEAD_REF: "cf/fe-1457-x" })).toBe(
      "cf/fe-1457-x",
    );
  });
});

describe("resolveSourceUrlPrefix", () => {
  it("points at `main` by default", () => {
    expect(resolveSourceUrlPrefix({})).toBe(
      "https://github.com/hashintel/hash/blob/main/",
    );
  });

  it("keeps the slashes in a branch name, which are path separators", () => {
    expect(resolveSourceUrlPrefix({ GITHUB_HEAD_REF: "cf/fe-1457-x" })).toBe(
      "https://github.com/hashintel/hash/blob/cf/fe-1457-x/",
    );
  });

  it("encodes a character that would otherwise change the URL", () => {
    expect(resolveSourceUrlPrefix({ GITHUB_HEAD_REF: "cf/a#b" })).toBe(
      "https://github.com/hashintel/hash/blob/cf/a%23b/",
    );
  });
});

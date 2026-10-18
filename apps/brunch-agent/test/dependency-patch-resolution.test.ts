/**
 * Every package that depends on a patched Flue or Pi package must resolve the
 * patched copy. Root resolutions select patches by version range, so a bump
 * that misses a selector installs the unpatched release beside the patched one
 * without any install or type error. Ask Yarn for the resolved graph rather
 * than re-deriving its resolution rules.
 */
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { expect, test } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));

/** The packages `docs/dependency-patches.md` records as carrying Brunch-owned patches. */
const patchedPackages = [
  "@flue/runtime",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
];

type WhyLine = {
  value: string;
  children: Record<string, { locator: string }>;
};

const resolvedEdges = async (ident: string) => {
  const { stdout } = await promisify(execFile)(
    "yarn",
    ["why", ident, "--json"],
    { cwd: repositoryRoot },
  );
  return stdout
    .split("\n")
    .filter((line) => line.trim() !== "")
    .flatMap((line) => {
      const { value: dependent, children } = JSON.parse(line) as WhyLine;
      return Object.values(children).map(({ locator }) => ({
        dependent,
        locator,
      }));
    });
};

test.each(patchedPackages)(
  "every dependent of %s resolves its patched copy",
  async (ident) => {
    const edges = await resolvedEdges(ident);

    expect(edges.length).toBeGreaterThan(0);
    expect(
      edges.filter(({ locator }) => !locator.startsWith(`${ident}@patch:`)),
    ).toEqual([]);
  },
);

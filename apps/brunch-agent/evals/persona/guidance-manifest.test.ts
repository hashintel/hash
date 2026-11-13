import { expect, test } from "vitest";

import {
  guidanceManifest,
  hashAgentGuidance,
  petrinautAgentGuidance,
  verifyGuidanceResume,
} from "./guidance-manifest.ts";

test("the manifest fingerprints the agent's guidance and Ledger, and a changed source refuses resume", async () => {
  const manifest = await guidanceManifest(petrinautAgentGuidance);
  const paths = manifest.files.map(({ path }) => path);
  expect(paths).toEqual(
    expect.arrayContaining([
      "apps/brunch-agent/src/agents/petrinaut/agent.ts",
      "apps/brunch-agent/src/agents/petrinaut/prompts/system.md",
      "libs/@hashintel/brunch-agent/src/ledger/commits.ts",
      "yarn.lock",
    ]),
  );
  await expect(
    verifyGuidanceResume(manifest, petrinautAgentGuidance),
  ).resolves.toEqual(manifest);
  await expect(
    verifyGuidanceResume(
      { ...manifest, sha256: "changed" },
      petrinautAgentGuidance,
    ),
  ).rejects.toThrow(/changed/);
  await expect(
    verifyGuidanceResume(undefined, petrinautAgentGuidance),
  ).rejects.toThrow(/no guidance manifest/);
});

test("the HASH agent's manifest fingerprints its own guidance and tools", async () => {
  const paths = (await guidanceManifest(hashAgentGuidance)).files.map(
    ({ path }) => path,
  );
  expect(paths).toEqual(
    expect.arrayContaining([
      "apps/brunch-agent/src/agents/hash/agent.ts",
      "apps/brunch-agent/src/agents/hash/prompts/system.md",
      "apps/brunch-agent/src/agents/hash/tools/hash-graph-reads.ts",
    ]),
  );
  expect(paths).not.toContain(
    "apps/brunch-agent/src/agents/petrinaut/agent.ts",
  );
});

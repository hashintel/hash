import { expect, test } from "vitest";

import { guidanceManifest, verifyGuidanceResume } from "./guidance-manifest.ts";

test("the manifest fingerprints the agent's guidance and Ledger, and a changed source refuses resume", async () => {
  const manifest = await guidanceManifest();
  const paths = manifest.files.map(({ path }) => path);
  expect(paths).toEqual(
    expect.arrayContaining([
      "apps/brunch-agent/src/agents/chat-agent/agent.ts",
      "apps/brunch-agent/src/agents/chat-agent/guidance/manual/prompts/system.md",
      "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/ledger2/commits.ts",
      "yarn.lock",
    ]),
  );
  await expect(verifyGuidanceResume(manifest)).resolves.toEqual(manifest);
  await expect(
    verifyGuidanceResume({ ...manifest, sha256: "changed" }),
  ).rejects.toThrow(/changed/);
  await expect(verifyGuidanceResume(undefined)).rejects.toThrow(
    /no guidance manifest/,
  );
});

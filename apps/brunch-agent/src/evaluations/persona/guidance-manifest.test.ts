import { expect, test } from "vitest";

import { selectGuidanceVariant } from "../../agents/chat-agent/guidance-variant.ts";
import { guidanceManifest, verifyGuidanceResume } from "./guidance-manifest.ts";

test("replacement and feedback provenance differ only by the feedback policy", async () => {
  const [baseline, replacement, feedback] = await Promise.all([
    guidanceManifest("baseline"),
    guidanceManifest("replacement"),
    guidanceManifest("feedback"),
  ]);
  expect(replacement.files).toEqual(
    feedback.files.filter((file) => !file.path.endsWith("/feedback.md")),
  );
  expect(replacement.sha256).not.toBe(feedback.sha256);
  expect(
    baseline.files.some((file) => file.path.endsWith("/elicitation/SKILL.md")),
  ).toBe(true);
  expect(
    replacement.files.some((file) => file.path.endsWith("/eliciting/SKILL.md")),
  ).toBe(true);
  await expect(verifyGuidanceResume(replacement)).resolves.toEqual(replacement);
  await expect(
    verifyGuidanceResume({ ...replacement, sha256: "changed" }),
  ).rejects.toThrow(/changed/);
  expect(() => selectGuidanceVariant("unknown")).toThrow(/variant/);
});

test("identity provenance is feedback's plus the identity Ledger guidance", async () => {
  const [feedback, identity] = await Promise.all([
    guidanceManifest("feedback"),
    guidanceManifest("identity"),
  ]);
  const identityOnly = identity.files
    .map(({ path }) => path)
    .filter((path) => !feedback.files.some((file) => file.path === path));
  expect(identityOnly.sort()).toEqual([
    "apps/brunch-agent/src/agents/chat-agent/guidance/identity-ledger.md",
    "apps/brunch-agent/src/agents/chat-agent/guidance/ledger-vocabulary.ts",
  ]);
  expect(
    feedback.files.some((file) => file.path.endsWith("/ledger/vocabulary.ts")),
  ).toBe(true);
});

test("manual provenance is its own guidance copy, and no other arm's", async () => {
  const [identity, manual] = await Promise.all([
    guidanceManifest("identity"),
    guidanceManifest("manual"),
  ]);
  const guidance = "apps/brunch-agent/src/agents/chat-agent/guidance";
  const isManual = (path: string) => path.startsWith(`${guidance}/manual`);
  const manualPaths = manual.files.map(({ path }) => path);
  expect(manualPaths).toContain(`${guidance}/manual.ts`);
  expect(manualPaths).toContain(`${guidance}/manual/identity-ledger.md`);
  expect(
    manualPaths.filter(
      (path) => path.startsWith(`${guidance}/`) && !isManual(path),
    ),
  ).toEqual([]);
  expect(identity.files.some(({ path }) => isManual(path))).toBe(false);
});

import { mkdtemp, readlink, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, it } from "vitest";

import { createSymlinkIfMissing } from "./init";

it("leaves an existing dangling symlink in place", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "skill-management-"));
  const aliasPath = path.join(directory, "alias");

  try {
    await symlink("missing-target", aliasPath);

    await expect(
      createSymlinkIfMissing("replacement-target", aliasPath),
    ).resolves.toBeUndefined();
    await expect(readlink(aliasPath)).resolves.toBe("missing-target");
  } finally {
    await rm(directory, { recursive: true });
  }
});

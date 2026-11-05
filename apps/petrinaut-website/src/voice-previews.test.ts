import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import { voiceNames } from "@hashintel/brunch-agent";

// Brunch's Voice settings preview each voice from `/voice-previews/v1`, which
// this website serves from `public/`.
test("has a static preview asset for every supported provider voice", () => {
  const assetRoot = fileURLToPath(
    new URL("../public/voice-previews/v1", import.meta.url),
  );
  for (const [provider, voices] of Object.entries(voiceNames)) {
    for (const voice of voices) {
      const asset = join(assetRoot, provider, `${voice}.mp3`);
      expect(existsSync(asset), asset).toBe(true);
    }
  }
});

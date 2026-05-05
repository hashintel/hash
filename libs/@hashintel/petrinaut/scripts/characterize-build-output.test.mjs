import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  formatBytes,
  parseBareImports,
  summarizeDistDirectory,
} from "./characterize-build-output.mjs";

describe("characterize-build-output", () => {
  it("parses static bare imports from ESM output", () => {
    const imports = parseBareImports(`
      import React from "react";
      import "@hashintel/petrinaut/styles.css";
      import { css } from "@hashintel/ds-helpers/css";
      import("./lazy-local.js");
      import("./worker.js");
      export * from "use-sync-external-store/shim/with-selector";
    `);

    expect(imports).toEqual([
      "@hashintel/ds-helpers/css",
      "@hashintel/petrinaut/styles.css",
      "react",
      "use-sync-external-store/shim/with-selector",
    ]);
  });

  it("summarizes dist assets by type and known heavy dependency signals", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "petrinaut-dist-"));
    try {
      await writeFile(
        path.join(tempDir, "main.js"),
        [
          'import * as Babel from "@babel/standalone";',
          'import ELK from "elkjs";',
          'import { jsx } from "react/jsx-runtime";',
        ].join("\n"),
      );
      await writeFile(
        path.join(tempDir, "main.css"),
        "@font-face{font-family:Inter}.root{display:flex}",
      );
      await writeFile(
        path.join(tempDir, "simulation.worker-abc123.js"),
        "self.postMessage('ready');",
      );
      await writeFile(
        path.join(tempDir, "main.js.map"),
        JSON.stringify({
          version: 3,
          sources: ["../../ds-helpers/styled-system/css/css.mjs"],
        }),
      );

      const summary = await summarizeDistDirectory(tempDir);

      expect(summary.assetGroups.js.count).toBe(2);
      expect(summary.assetGroups.css.count).toBe(1);
      expect(summary.workerAssets).toHaveLength(1);
      expect(summary.css.fontFaceRules).toBe(1);
      expect(summary.mainJs.bareImports).toEqual([
        "@babel/standalone",
        "elkjs",
        "react/jsx-runtime",
      ]);
      expect(summary.mainJs.heavyDependencySignals).toMatchObject({
        "@babel/standalone": true,
        elkjs: true,
      });
      expect(summary.sourceMapSignals.dsHelpersSources).toBe(1);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("formats byte counts consistently", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1_536)).toBe("1.5 KiB");
  });
});

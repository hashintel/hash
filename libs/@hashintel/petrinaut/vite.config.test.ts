import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isLibraryExternal } from "./vite.config";

describe("petrinaut package boundary", () => {
  it("externalizes peer dependency subpaths as part of the library boundary", () => {
    expect(isLibraryExternal("@hashintel/ds-components")).toBe(true);
    expect(isLibraryExternal("@hashintel/ds-components/preset")).toBe(true);
    expect(isLibraryExternal("@hashintel/ds-helpers")).toBe(true);
    expect(isLibraryExternal("@hashintel/ds-helpers/css")).toBe(true);
    expect(isLibraryExternal("@xyflow/react")).toBe(true);
    expect(isLibraryExternal("@xyflow/react/dist/style.css")).toBe(true);
    expect(isLibraryExternal("react")).toBe(true);
    expect(isLibraryExternal("react/jsx-runtime")).toBe(true);
    expect(isLibraryExternal("react-dom")).toBe(true);
    expect(isLibraryExternal("react-dom/client")).toBe(true);
    expect(isLibraryExternal("use-sync-external-store/shim/with-selector")).toBe(
      true,
    );
  });

  it("keeps local and ordinary dependency imports inside the library build", () => {
    expect(isLibraryExternal("./src/main")).toBe(false);
    expect(isLibraryExternal("fuzzysort")).toBe(false);
    expect(isLibraryExternal("@ark-ui/react/select")).toBe(false);
  });

  it("declares explicit public exports for the entrypoint and stylesheet", async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(import.meta.dirname, "package.json"), "utf8"),
    ) as {
      exports?: {
        "."?: { types?: string; import?: string };
        "./styles.css"?: string;
        "./package.json"?: string;
      };
      main?: string;
      style?: string;
      types?: string;
    };

    expect(packageJson.main).toBe("dist/main.js");
    expect(packageJson.types).toBe("dist/main.d.ts");
    expect(packageJson.style).toBe("dist/main.css");
    expect(packageJson.exports?.["."]).toEqual({
      types: "./dist/main.d.ts",
      import: "./dist/main.js",
    });
    expect(packageJson.exports?.["./styles.css"]).toBe("./dist/main.css");
    expect(packageJson.exports?.["./package.json"]).toBe("./package.json");
  });
});

// Reuse installed Pi; no dependency install and no global extension/resource discovery.
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, parse } from "node:path";
import { pathToFileURL } from "node:url";

const defaultSdkRoot = () => {
  const executable = execFileSync("which", ["pi"], { encoding: "utf8" }).trim();
  let candidate = dirname(realpathSync(executable));
  const filesystemRoot = parse(candidate).root;
  while (candidate !== filesystemRoot) {
    try {
      const manifest = JSON.parse(
        readFileSync(join(candidate, "package.json"), "utf8"),
      );
      if (manifest.name === "@earendil-works/pi-coding-agent") {
        return candidate;
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
    candidate = dirname(candidate);
  }
  throw new Error(
    "Could not find the @earendil-works/pi-coding-agent package behind pi on PATH. Set PI_SDK_ROOT explicitly.",
  );
};

export async function loadPi() {
  const root = process.env.PI_SDK_ROOT ?? defaultSdkRoot();
  const require = createRequire(join(root, "package.json"));
  const sdk = await import(pathToFileURL(join(root, "dist/index.js")).href);
  const { Type } = await import(pathToFileURL(require.resolve("typebox")).href);
  // pi-ai's exports are import-only, so createRequire.resolve cannot select ./compat.
  const compat = await import(
    pathToFileURL(
      join(root, "node_modules/@earendil-works/pi-ai/dist/compat.js"),
    ).href
  );
  return { ...sdk, Type, compat };
}

export function isolatedResources(sdk, prompt) {
  const runtime = sdk.createExtensionRuntime();
  return {
    getExtensions: () => ({ extensions: [], errors: [], runtime }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => prompt,
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
}

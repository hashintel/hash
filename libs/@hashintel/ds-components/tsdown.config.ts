import { globSync } from "node:fs";
import path from "node:path";

import svgr from "@svgr/rollup";
import { defineConfig } from "tsdown";

const componentEntries = Object.fromEntries(
  globSync("./src/components/*/*.tsx", { exclude: ["**/*.stories.tsx"] }).map(
    (file) => [`components/${path.basename(file, ".tsx")}`, file],
  ),
);

const suppressedWarningIds = [
  "node_modules/pkg-types/dist/index.d.mts",
  "node_modules/ts-evaluator/dist/esm/index.d.ts",
];

const isSuppressedBuildWarning = (
  level: "warn" | "info" | "debug",
  log: { code?: string; id?: string },
) => {
  if (level !== "warn") {
    return false;
  }

  if (log.code === "PLUGIN_TIMINGS") {
    return true;
  }

  const logId = log.id;

  return (
    (log.code === "MISSING_EXPORT" || log.code === "IMPORT_IS_UNDEFINED") &&
    typeof logId === "string" &&
    suppressedWarningIds.some((warningId) => logId.includes(warningId))
  );
};

export default defineConfig({
  platform: "neutral",
  entry: {
    main: "./src/main.ts",
    preset: "./src/preset.ts",
    theme: "./src/theme.ts",
    ...componentEntries,
  },
  copy: ["./src/types.d.ts"],
  plugins: [svgr()],
  format: ["esm"],
  deps: {
    onlyBundle: false,
  },
  dts: true,
  inputOptions: {
    onLog(level, log, defaultHandler) {
      if (isSuppressedBuildWarning(level, log)) {
        return;
      }

      defaultHandler(level, log);
    },
  },
});

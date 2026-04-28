import { globSync } from "node:fs";
import path from "node:path";

const componentEntries = Object.fromEntries(
  globSync("./src/components/*/*.tsx", { exclude: ["**/*.stories.tsx"] }).map(
    (file) => [`components/${path.basename(file, ".tsx")}`, file],
  ),
);

export default {
  clean: true,
  dts: true,
  entry: {
    main: "./src/main.ts",
    preset: "./src/preset.ts",
    theme: "./src/theme.ts",
    ...componentEntries,
  },
  format: ["esm"],
  outDir: "dist",
  platform: "neutral",
  tsconfig: "./tsconfig.build.json",
};

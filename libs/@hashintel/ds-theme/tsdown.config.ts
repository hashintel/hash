import { defineConfig } from "tsdown";

export default defineConfig({
  platform: "neutral",
  entry: ["./src/main.ts", "./src/theme.ts"],
});

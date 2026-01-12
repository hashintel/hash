/** @type {import('@ladle/react').UserConfig} */
export default {
  base: process.env.LADLE_BASE_PATH || "/",
  stories: "src/**/*.stories.{js,ts,mdx}",
  port: 61000,
  viteConfig: "./vite.config.ts",
  outDir: ".build/ladle",
  envDir: ".",
  addons: {
    rtl: { enabled: false },
    a11y: { enabled: false },
    action: { enabled: false },
    background: { enabled: true },
    control: { enabled: true },
    ladle: { enabled: false },
    mode: { enabled: true },
    msw: { enabled: false },
    source: { enabled: false },
    theme: { enabled: true },
    width: { enabled: true },
  },
};

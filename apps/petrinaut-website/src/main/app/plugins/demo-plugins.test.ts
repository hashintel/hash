import { beforeEach, expect, test, vi } from "vitest";

// Each plugin is tested on its own; the list only needs their ids.
const pluginWithId = vi.hoisted(() => (id: string) => ({ manifest: { id } }));
vi.mock("./brunch/plugin", () => ({
  brunchPlugin: pluginWithId("website.brunch"),
}));
vi.mock("./command-palette/plugin", () => ({
  commandPalettePlugin: pluginWithId("website.command-palette"),
}));
vi.mock("./petrinaut-ai/plugin", () => ({
  petrinautAiPlugin: pluginWithId("website.petrinaut-ai"),
}));
vi.mock("./sentry-feedback/plugin", () => ({
  sentryFeedbackPlugin: pluginWithId("website.sentry-feedback"),
}));
vi.mock("./share/plugin", () => ({
  sharePlugin: pluginWithId("website.share"),
}));
vi.mock("./voice/plugin", () => ({
  voicePlugin: pluginWithId("website.voice"),
}));
vi.mock("./walkthrough/plugin", () => ({
  walkthroughPlugin: pluginWithId("website.walkthrough"),
}));

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  // A developer's `.env.local` may set it, as the README suggests for Brunch.
  vi.stubEnv("VITE_PETRINAUT_DEFAULT_ASSISTANT", "");
});

/** The ids of the list the module builds from the current configuration. */
const demoPluginIds = async () =>
  (await import("./demo-plugins")).demoPlugins.map(
    ({ manifest }) => manifest.id,
  );

test("lists Petrinaut AI, then Brunch and Voice, with a Brunch endpoint", async () => {
  vi.stubEnv("VITE_BRUNCH_CHAT_ENDPOINT", "/agents/chat");
  expect(await demoPluginIds()).toEqual([
    "website.share",
    "website.sentry-feedback",
    "website.command-palette",
    "website.walkthrough",
    "website.petrinaut-ai",
    "website.brunch",
    "website.voice",
  ]);
});

test("lists Brunch first when it is the configured default assistant", async () => {
  vi.stubEnv("VITE_BRUNCH_CHAT_ENDPOINT", "/agents/chat");
  vi.stubEnv("VITE_PETRINAUT_DEFAULT_ASSISTANT", "brunch");
  expect((await demoPluginIds()).slice(4)).toEqual([
    "website.brunch",
    "website.petrinaut-ai",
    "website.voice",
  ]);
});

test("lists Petrinaut AI alone without a Brunch endpoint", async () => {
  vi.stubEnv("VITE_BRUNCH_CHAT_ENDPOINT", "");
  expect((await demoPluginIds()).slice(4)).toEqual(["website.petrinaut-ai"]);
});

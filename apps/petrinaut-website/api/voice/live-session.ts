import { createOpenAILiveSessionHandler } from "@hashintel/brunch-agent/server";

declare const process: { env: Record<string, string | undefined> };

export default {
  fetch: createOpenAILiveSessionHandler({
    environment: process.env,
    fetch: globalThis.fetch.bind(globalThis),
  }),
};

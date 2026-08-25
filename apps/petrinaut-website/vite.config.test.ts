import { afterEach, describe, expect, test } from "vitest";

import viteConfig from "./vite.config";

const originalOpenAiApiKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  if (originalOpenAiApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalOpenAiApiKey;
  }
});

describe("server environment loading", () => {
  test("treats the repository OpenAI placeholder as unset", () => {
    process.env.OPENAI_API_KEY = "dummy";

    if (typeof viteConfig !== "function") {
      throw new TypeError("Expected a Vite config function");
    }

    void viteConfig({
      command: "serve",
      isPreview: false,
      isSsrBuild: false,
      mode: "test",
    });

    expect(process.env.OPENAI_API_KEY).not.toBe("dummy");
  });
});

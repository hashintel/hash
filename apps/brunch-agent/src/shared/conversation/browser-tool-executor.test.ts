import { expect, test } from "vitest";

import { browserResultEnvelope } from "./browser-tool-executor.ts";

test("the envelope preserves JSON results and optional metadata without normalization", () => {
  const output = { values: [null, false, -0, "text"] };
  const metadata = { revision: "r1" };
  const envelope = browserResultEnvelope({ output, metadata });
  expect(envelope.output).toBe(output);
  expect(envelope.metadata).toBe(metadata);
  expect(browserResultEnvelope({ output: null })).toEqual({
    brunchBrowserResult: true,
    output: null,
  });
});

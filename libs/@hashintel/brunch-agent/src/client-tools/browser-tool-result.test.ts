import { describe, expect, test } from "vitest";

import {
  browserToolEnvelopeOf,
  browserToolOutput,
} from "./browser-tool-result";

describe("browserToolEnvelopeOf", () => {
  test("recognises a settled envelope, with or without its sidecar", () => {
    expect(
      browserToolEnvelopeOf({
        brunchBrowserResult: true,
        output: { applied: true },
        metadata: { documentRevision: {} },
      }),
    ).toEqual({
      brunchBrowserResult: true,
      output: { applied: true },
      metadata: { documentRevision: {} },
    });
    const bare = browserToolEnvelopeOf({
      brunchBrowserResult: true,
      output: undefined,
    });
    expect(bare).toEqual({ brunchBrowserResult: true, output: undefined });
    expect(bare && "metadata" in bare).toBe(false);
  });

  test("rejects outputs without the marker or without an output", () => {
    expect(browserToolEnvelopeOf({ output: 1 })).toBeUndefined();
    expect(
      browserToolEnvelopeOf({ brunchBrowserResult: "true", output: 1 }),
    ).toBeUndefined();
    expect(
      browserToolEnvelopeOf({ brunchBrowserResult: true }),
    ).toBeUndefined();
    expect(browserToolEnvelopeOf(null)).toBeUndefined();
    expect(browserToolEnvelopeOf("text")).toBeUndefined();
  });
});

describe("browserToolOutput", () => {
  test("unwraps an envelope and passes anything else through", () => {
    expect(
      browserToolOutput({ brunchBrowserResult: true, output: { ok: 1 } }),
    ).toEqual({ ok: 1 });
    expect(browserToolOutput({ ok: 1 })).toEqual({ ok: 1 });
  });
});

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, test, vi } from "vitest";

import {
  paneIdFrom,
  personaArguments,
  readPersonaCase,
  responds,
} from "./launch.ts";

const loadingRuntimeUnavailable = {
  error: { type: "runtime_unavailable", meta: { state: "loading" } },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

test.each([true, false])(
  "reads a generic case and separates the public opening (header: %s)",
  async (header) => {
    const directory = await mkdtemp(join(tmpdir(), "brunch-launch-test-"));
    try {
      await Promise.all([
        writeFile(join(directory, "situation-pack.md"), "PRIVATE background"),
        writeFile(
          join(directory, "opening-message.md"),
          `${header ? "PRIVATE operator note\n\n---\n\n" : ""}Hello, please interview me.\n`,
        ),
      ]);
      expect(await readPersonaCase(directory)).toEqual({
        pack: "PRIVATE background",
        opening: "Hello, please interview me.",
      });
    } finally {
      await rm(directory, { recursive: true });
    }
  },
);

test("launches a fresh restricted persona using input files, not prior session or private content arguments", () => {
  const args = personaArguments("/tmp/TEST-persona", "claude-sonnet-4-6");
  expect(args).toContain("anthropic/claude-sonnet-4-6");
  expect(args).toContain("brunch_turn");
  expect(args).toContain("--no-context-files");
  expect(args).toContain("--no-builtin-tools");
  expect(args).toContain("--no-extensions");
  expect(args).toContain("--no-approve");
  expect(args).toContain("/tmp/TEST-persona/session.json");
  expect(args.at(-1)).toBe("@/tmp/TEST-persona/persona-input.md");
  expect(args).not.toContain("--session");
  expect(args).not.toContain("--continue");
  expect(args).not.toContain("--api-key");
});

test("treats only Flue's loading runtime-unavailable response as not ready while polling an owned service", async () => {
  const fetch = vi.fn<() => Promise<Response>>().mockResolvedValue(
    new Response(JSON.stringify(loadingRuntimeUnavailable), {
      status: 503,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetch);

  await expect(
    responds("http://127.0.0.1:4321/health", new AbortController().signal, {
      allowLoading: true,
    }),
  ).resolves.toBe(false);
  expect(fetch).toHaveBeenCalledOnce();
});

test("refuses a loading response from a pre-existing service", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<() => Promise<Response>>().mockResolvedValue(
      new Response(JSON.stringify(loadingRuntimeUnavailable), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    ),
  );

  await expect(
    responds("http://127.0.0.1:4321/health", new AbortController().signal),
  ).rejects.toThrow("returned 503");
});

test.each([
  {
    body: { error: { type: "runtime_unavailable", meta: { state: "failed" } } },
    status: 503,
  },
  { body: { error: { type: "runtime_unavailable" } }, status: 503 },
  { body: { error: { type: "other" } }, status: 503 },
  { body: {}, status: 500 },
])("refuses unhealthy startup response %#", async ({ body, status }) => {
  vi.stubGlobal(
    "fetch",
    vi.fn<() => Promise<Response>>().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    ),
  );

  await expect(
    responds("http://127.0.0.1:4321/health", new AbortController().signal, {
      allowLoading: true,
    }),
  ).rejects.toThrow(`returned ${status}`);
});

test("reads the pane id from herdr's split result", () => {
  expect(
    paneIdFrom(
      '{"id":"cli:pane:split","result":{"pane":{"pane_id":"w0:p23"}},"type":"pane_split"}',
    ),
  ).toBe("w0:p23");
});

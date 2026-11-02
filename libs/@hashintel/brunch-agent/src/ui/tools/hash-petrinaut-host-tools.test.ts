/** @vitest-environment jsdom */
/**
 * HASH's Petrinaut tools as the page runs them: an issued call is claimed,
 * started and settled through Brunch's in-band browser calls, runs its
 * canonical operation against the editor, and records the document's revision
 * as that operation would.
 */
import { afterEach, expect, test, vi } from "vitest";

import { canonicalContent, hashProcessEditorId } from "@hashintel/brunch-agent";
import {
  createJsonDocHandle,
  createPetrinaut,
  type SDCPN,
  toPetrinautId,
} from "@hashintel/petrinaut-core";

import { createInBandBrowserCalls } from "../../client/tools/in-band-browser-call";
import { createTestEditorApi } from "../chat/testing/create-test-editor-api";
import {
  createCanonicalPetrinautHostTools,
  EMPTY_CANONICAL_PETRINAUT_REPLAY,
  issuedCanonicalCallsFromHistory,
} from "./brunch-petrinaut-tools";
import { hashPetrinautHostTools } from "./hash-petrinaut-host-tools";
import { documentRevisionOf } from "./shared/document-revision";

import type { FlueClient } from "@flue/sdk";
import type { BrowserCallResultBody } from "@hashintel/brunch-agent";

vi.hoisted(() => {
  window.matchMedia = (media) => ({
    media,
    matches: false,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
  });
});

afterEach(() => vi.unstubAllGlobals());

const emptyNet: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};
const place = {
  id: "queue",
  name: "Queue",
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
  targetSubnetId: null,
};
const binding = { conversationId: "conversation", documentId: "document" };
const toolName = "petrinaut_create_place";

/**
 * Runs one issued call as the page does, against a fresh editor: claims it,
 * starts it, runs the host tool, and settles it. Returns what the browser
 * posted as the call's result, or the failure it reported.
 */
const runIssuedCall = async (input: unknown) => {
  const instance = createPetrinaut({
    document: createJsonDocHandle({
      id: "document",
      initial: structuredClone(emptyNet),
      capabilities: { disabledExtensions: [] },
    }),
  });
  const { edit } = createTestEditorApi(instance).document;
  const host = createCanonicalPetrinautHostTools({
    handle: instance.handle,
    readTitle: () => "Untitled",
    replayReadiness: {
      status: "ready",
      replay: EMPTY_CANONICAL_PETRINAUT_REPLAY,
    },
  });
  const posted: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      if (init?.method === "POST") {
        posted.push({
          url: url instanceof Request ? url.url : url.toString(),
          body: JSON.parse(
            typeof init.body === "string" ? init.body : "null",
          ) as unknown,
        });
        return new Response(null, { status: 204 });
      }
      return Response.json({
        capability: "capability",
        binding: canonicalContent(binding),
        toolName,
        input,
      });
    }),
  );
  const calls = createInBandBrowserCalls({
    client: Promise.resolve({
      url: "http://brunch.local/agents/hash/instance",
    } as FlueClient),
    ownerKey: "owner",
    binding,
    metadataFor: host.clientToolResultMetadataFor,
    prepareInput: host.mapClientToolInput,
    acceptsRevision: host.acceptsRevision,
  });
  const tool = hashPetrinautHostTools.find(
    (candidate) => candidate.toolName === toolName,
  );
  if (!tool) throw new Error(`The page has no ${toolName}.`);
  const before = documentRevisionOf(emptyNet);
  const failure = await calls
    .run(
      {
        toolCallId: "call",
        toolName,
        input,
        signal: new AbortController().signal,
      },
      async (issued) =>
        tool.execute({
          input: tool.inputParser.parse(issued),
          edit,
          handle: instance.handle,
          readDiagnosticsContext: async () => "",
          toolCallId: "call",
          signal: new AbortController().signal,
        }),
    )
    .then(
      () => undefined,
      (error: unknown) => error,
    );
  const result = posted.find(({ url }) => url.endsWith("/call"))?.body as
    | BrowserCallResultBody
    | undefined;
  return { instance, before, result, failure, posted };
};

test("a call for the page's editor adds the place and settles with the revisions before and after and the net read back", async () => {
  const { instance, before, result } = await runIssuedCall({
    editor_id: hashProcessEditorId,
    ...place,
  });
  const definition = instance.handle.doc();
  if (!definition) throw new Error("The test document is unavailable.");
  expect(definition.places).toMatchObject([
    { id: toPetrinautId("queue"), name: "Queue" },
  ]);
  expect(result?.output).not.toMatchObject({ applied: false });
  expect(result?.metadata).toEqual({
    documentRevision: { before, after: documentRevisionOf(definition) },
    readBack: {
      ...emptyNet,
      places: [
        {
          id: toPetrinautId("queue"),
          name: "Queue",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
        },
      ],
    },
  });
});

test("a call naming an editor the page doesn't show fails as started and leaves the net as it was", async () => {
  const { instance, failure, posted } = await runIssuedCall({
    editor_id: "another-editor",
    ...place,
  });
  expect(failure).toBeInstanceOf(Error);
  expect(instance.handle.doc()?.places).toEqual([]);
  expect(posted).toEqual([
    expect.objectContaining({
      url: expect.stringMatching(/\/call\/fail$/u) as unknown,
      body: expect.objectContaining({ disposition: "failed" }) as unknown,
    }),
  ]);
});

test("the revision chain survives a reload through a settled HASH Petrinaut change in history", async () => {
  const replay = await issuedCanonicalCallsFromHistory({
    snapshot: {
      messages: [
        {
          role: "assistant",
          purpose: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolName,
              toolCallId: "create",
              state: "output-available",
              input: { editor_id: hashProcessEditorId, ...place },
              output: {
                brunchBrowserResult: true,
                output: {},
                metadata: {
                  documentRevision: {
                    before: "r-seen",
                    after: documentRevisionOf(emptyNet),
                  },
                },
              },
            },
          ],
        },
      ],
    } as never,
  });
  const host = createCanonicalPetrinautHostTools({
    handle: createJsonDocHandle({
      id: "document",
      initial: structuredClone(emptyNet),
      capabilities: { disabledExtensions: [] },
    }),
    readTitle: () => "Untitled",
    replayReadiness: { status: "ready", replay },
  });
  expect(host.acceptsRevision("r-seen")).toBe(true);
  expect(host.acceptsRevision("r-other")).toBe(false);
});

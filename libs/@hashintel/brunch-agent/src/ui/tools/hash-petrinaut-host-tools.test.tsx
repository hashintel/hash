/** @vitest-environment jsdom */
/**
 * HASH's Petrinaut tools as the page runs them: an issued call is claimed,
 * admitted, started and settled through Brunch's in-band browser calls, runs
 * its canonical operations against the editor, and records the document's
 * revision as one call.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { canonicalContent, hashProcessEditorId } from "@hashintel/brunch-agent";
import {
  createJsonDocHandle,
  createPetrinaut,
  type SDCPN,
  toPetrinautId,
} from "@hashintel/petrinaut-core";

import {
  createInBandBrowserCalls,
  type InBandBrowserCallAdmission,
} from "../../client/tools/in-band-browser-call";
import { createTestEditorApi } from "../chat/testing/create-test-editor-api";
import {
  createBrunchMutationAdmission,
  createBrunchMutationApprovalCoordinator,
  createBrunchMutationApprovalWidget,
} from "./brunch-mutation-approval";
import {
  createCanonicalPetrinautHostTools,
  EMPTY_CANONICAL_PETRINAUT_REPLAY,
  issuedCanonicalCallsFromHistory,
} from "./brunch-petrinaut-tools";
import { hashPetrinautHostTools } from "./hash-petrinaut-host-tools";
import { documentRevisionOf } from "./shared/document-revision";

import type { FlueClient } from "@flue/sdk";
import type {
  BrowserCallResultBody,
  ClientToolResultMetadata,
} from "@hashintel/brunch-agent";

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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const emptyNet: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};
const placeNamed = (id: string, name: string) => ({
  id,
  name,
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
});
const place = { ...placeNamed("queue", "Queue"), targetSubnetId: null };
/** Two places and a transition taking one token from the first. */
const servedNet: SDCPN = {
  ...emptyNet,
  places: [placeNamed("queue", "Queue"), placeNamed("buffer", "Buffer")],
  transitions: [
    {
      id: "serve",
      name: "Serve",
      inputArcs: [{ placeId: "queue", weight: 1, type: "standard" }],
      outputArcs: [],
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
      x: 0,
      y: 0,
    },
  ],
};
const binding = { conversationId: "conversation", documentId: "document" };

/**
 * Runs one issued call as the page does, against a fresh editor holding
 * `initial`: claims it, admits it, starts it, runs the host tool, and settles
 * it. Returns what the browser posted as the call's result, or the failure it
 * reported.
 */
const runIssuedCall = async (
  toolName: string,
  input: unknown,
  {
    initial = emptyNet,
    admit,
  }: { initial?: SDCPN; admit?: InBandBrowserCallAdmission } = {},
) => {
  const instance = createPetrinaut({
    document: createJsonDocHandle({
      id: "document",
      initial: structuredClone(initial),
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
    ...(admit === undefined ? {} : { admit }),
    acceptsRevision: host.acceptsRevision,
  });
  const tool = hashPetrinautHostTools.find(
    (candidate) => candidate.toolName === toolName,
  );
  if (!tool) throw new Error(`The page has no ${toolName}.`);
  const definitionBefore = instance.handle.doc();
  if (!definitionBefore) throw new Error("The test document is unavailable.");
  const before = documentRevisionOf(definitionBefore);
  const settled = calls
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
  const outcome = async () => {
    const failure = await settled;
    const result = posted.find(({ url }) => url.endsWith("/call"))?.body as
      | BrowserCallResultBody
      | undefined;
    const definition = instance.handle.doc();
    if (!definition) throw new Error("The test document is unavailable.");
    return {
      before,
      definitionBefore,
      definition,
      revision: documentRevisionOf(definition),
      result,
      failure,
      posted,
    };
  };
  return { outcome };
};

test("a call for the page's editor adds the place and settles with the revisions before and after and the net read back", async () => {
  const { before, definition, revision, result } = await (
    await runIssuedCall("petrinaut_create_place", {
      editor_id: hashProcessEditorId,
      ...place,
    })
  ).outcome();
  expect(definition.places).toMatchObject([
    { id: toPetrinautId("queue"), name: "Queue" },
  ]);
  expect(result?.output).not.toMatchObject({ applied: false });
  expect(result?.metadata).toEqual({
    documentRevision: { before, after: revision },
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
  const { definition, failure, posted } = await (
    await runIssuedCall("petrinaut_create_place", {
      editor_id: "another-editor",
      ...place,
    })
  ).outcome();
  expect(failure).toBeInstanceOf(Error);
  expect(definition.places).toEqual([]);
  expect(posted).toEqual([
    expect.objectContaining({
      url: expect.stringMatching(/\/call\/fail$/u) as unknown,
      body: expect.objectContaining({ disposition: "failed" }) as unknown,
    }),
  ]);
});

test("a merged arc update retargets and reweights the arc in one call, with one revision before and one after", async () => {
  const { before, definition, revision, result } = await (
    await runIssuedCall(
      "petrinaut_update_arc",
      {
        editor_id: hashProcessEditorId,
        transitionId: "serve",
        arcDirection: "input",
        placeId: "queue",
        newPlaceId: "buffer",
        weight: 3,
      },
      { initial: servedNet },
    )
  ).outcome();
  expect(definition.transitions[0]?.inputArcs).toEqual([
    { placeId: toPetrinautId("buffer"), weight: 3, type: "standard" },
  ]);
  expect(result?.output).toMatchObject({ applied: true });
  const metadata = result?.metadata as ClientToolResultMetadata | undefined;
  expect(metadata?.documentRevision).toEqual({
    before,
    after: revision,
  });
  expect(revision).not.toBe(before);
  expect(metadata?.readBack?.transitions[0]?.inputArcs).toEqual([
    { placeId: toPetrinautId("buffer"), weight: 3, type: "standard" },
  ]);
});

test("a merged arc update whose retarget fails changes nothing, its reweight included", async () => {
  const { before, definition, definitionBefore, revision, failure } = await (
    await runIssuedCall(
      "petrinaut_update_arc",
      {
        editor_id: hashProcessEditorId,
        transitionId: "serve",
        arcDirection: "input",
        placeId: "queue",
        newPlaceId: "missing",
        weight: 3,
      },
      { initial: servedNet },
    )
  ).outcome();
  expect(failure).toBeInstanceOf(Error);
  expect(revision).toBe(before);
  expect(definition).toEqual(definitionBefore);
});

test("a HASH remove waits on the destructive-edit card, which offers Always allow, and runs once allowed", async () => {
  const coordinator = createBrunchMutationApprovalCoordinator();
  const input = { editor_id: hashProcessEditorId, placeId: "queue" };
  const { outcome } = await runIssuedCall("petrinaut_remove_place", input, {
    initial: servedNet,
    admit: createBrunchMutationAdmission(coordinator),
  });
  await vi.waitFor(() => expect(coordinator.hasPending("call")).toBe(true));
  const Card = createBrunchMutationApprovalWidget(
    coordinator,
    "petrinaut_remove_place",
  );
  const net = createPetrinaut({
    document: createJsonDocHandle({ initial: structuredClone(servedNet) }),
  }).definition;
  render(
    <Card
      input={input}
      net={net}
      state="awaiting"
      submit={vi.fn()}
      submitAndWait={vi.fn()}
      toolCallId="call"
    />,
  );
  expect(screen.getByText("Remove place — Queue")).not.toBeNull();
  expect(screen.getByRole("button", { name: "Always allow" })).not.toBeNull();
  coordinator.resolve("call", "allow");
  const { definition, result } = await outcome();
  expect(result?.output).toMatchObject({ applied: true });
  expect(definition.places.map(({ name }) => name)).toEqual(["Buffer"]);
  // Its arc went with it.
  expect(definition.transitions[0]?.inputArcs).toEqual([]);
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
              toolName: "petrinaut_create_place",
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

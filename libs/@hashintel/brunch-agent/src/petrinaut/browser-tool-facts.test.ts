/** @vitest-environment jsdom */
/**
 * What the browser side decides about each tool the server issues to it, read
 * through the decisions' own consumers: whether a claim accepts the issued
 * input, whether the call runs as an automatic in-band tool, and what a
 * settled result records of the document's revision.
 */
import { afterEach, describe, expect, test, vi } from "vitest";

import { createJsonDocHandle, type SDCPN } from "@hashintel/petrinaut-core";

import { createInBandBrowserCalls } from "../client/tools/in-band-browser-call";
import { brunchTools } from "../constants";
import {
  createCanonicalPetrinautHostTools,
  EMPTY_CANONICAL_PETRINAUT_REPLAY,
} from "../ui/tools/brunch-petrinaut-tools";
import { canonicalContent } from "./browser-metadata";

import type { FlueClient } from "@flue/sdk";

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

/**
 * How a claim treats an issued input that differs from the model's by a key
 * no tool defines: without an input schema the call was never issued to this
 * browser; inputs compared as issued mismatch; a tool's schema rejects the key.
 */
type Claim = "not-issued" | "compared-as-issued" | "parsed-by-schema";
/** What a call's settled result records when the document moved during it. */
type RevisionRecord = "nothing" | "before" | "before-after-and-read-back";

interface BrowserSide {
  readonly claim: Claim;
  readonly automatic: boolean;
  readonly revisionRecord: RevisionRecord;
}

const binding = { conversationId: "conversation", documentId: "document" };

const browserCalls = () =>
  createInBandBrowserCalls({
    client: Promise.resolve({
      url: "http://brunch.local/agents/petrinaut/instance",
    } as FlueClient),
    ownerKey: "owner",
    binding,
    metadataFor: () => undefined,
    prepareInput: () => {},
    acceptsRevision: () => true,
  });

const claimOf = async (toolName: string): Promise<Claim> => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () =>
      Response.json({
        capability: "capability",
        binding: canonicalContent(binding),
        toolName,
        input: { probe: "issued" },
      }),
    ),
  );
  const controller = new AbortController();
  const failure = await browserCalls()
    .claim({
      toolCallId: "call",
      toolName,
      input: { probe: "admitted" },
      signal: controller.signal,
    })
    .then(
      () => undefined,
      (error: unknown) => error,
    );
  // Stops a claimed call's lease timer.
  controller.abort();
  if (!(failure instanceof Error))
    throw new Error(`${toolName} accepted a key no tool defines.`);
  if (failure.message === "Browser call was not issued for this document.")
    return "not-issued";
  if (
    failure.message === "Issued browser input does not match the admitted call."
  )
    return "compared-as-issued";
  return "parsed-by-schema";
};

const emptyNet: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

const revisionRecordOf = (toolName: string): RevisionRecord => {
  const handle = createJsonDocHandle({
    id: "document",
    initial: structuredClone(emptyNet),
    capabilities: { disabledExtensions: [] },
  });
  const host = createCanonicalPetrinautHostTools({
    handle,
    readTitle: () => "Untitled",
    replayReadiness: {
      status: "ready",
      replay: EMPTY_CANONICAL_PETRINAUT_REPLAY,
    },
  });
  host.mapClientToolInput({ toolCallId: "call", toolName, input: {} });
  handle.change((draft) => {
    draft.parameters.push({
      id: "rate",
      name: "Rate",
      variableName: "rate",
      type: "real",
      defaultValue: "1",
    });
  });
  const metadata = host.clientToolResultMetadataFor("call");
  if (metadata === undefined) return "nothing";
  return metadata.documentRevision.after !== undefined &&
    metadata.readBack !== undefined
    ? "before-after-and-read-back"
    : "before";
};

const browserSideOf = async (toolName: string): Promise<BrowserSide> => ({
  claim: await claimOf(toolName),
  automatic: browserCalls().has(toolName),
  revisionRecord: revisionRecordOf(toolName),
});

const change: BrowserSide = {
  claim: "parsed-by-schema",
  automatic: true,
  revisionRecord: "before-after-and-read-back",
};
const netRead = (claim: Claim): BrowserSide => ({
  claim,
  automatic: true,
  revisionRecord: "before",
});
const hashRead: BrowserSide = {
  claim: "parsed-by-schema",
  automatic: true,
  revisionRecord: "before",
};

describe("what the browser decides about each tool the server issues to it", () => {
  test.each<[string, BrowserSide]>([
    // Canonical Petrinaut tools, one per capability.
    ["addPlace", change],
    ["applyAutoLayout", change],
    ["getLatestNetDefinition", netRead("parsed-by-schema")],
    ["getNetCompilationErrors", netRead("parsed-by-schema")],
    ["createExperiment", netRead("parsed-by-schema")],
    // The filtered net readers.
    ["readNetOutline", netRead("parsed-by-schema")],
    ["readNetStructure", netRead("parsed-by-schema")],
    // HASH's Petrinaut tools are their canonical operation's change.
    ["petrinaut_create_place", change],
    // The reviewed experiment draft runs through its own card.
    [
      brunchTools.draftPetrinautExperiment,
      { claim: "parsed-by-schema", automatic: false, revisionRecord: "before" },
    ],
    // HASH's graph reads and Save.
    [brunchTools.queryHashEntities, hashRead],
    [brunchTools.queryHashEntityTypes, hashRead],
    [brunchTools.queryHashWebs, hashRead],
    [
      brunchTools.saveHashNet,
      {
        claim: "parsed-by-schema",
        automatic: true,
        revisionRecord: "nothing",
      },
    ],
    // A tool the server never issues counts as a possible change.
    [
      "unmounted_tool",
      {
        claim: "not-issued",
        automatic: false,
        revisionRecord: "before-after-and-read-back",
      },
    ],
  ])("%s", async (toolName, expected) => {
    expect(await browserSideOf(toolName)).toEqual(expected);
  });
});

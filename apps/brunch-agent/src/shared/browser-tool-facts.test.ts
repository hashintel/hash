/**
 * What the server decides about each tool it issues to the bound browser,
 * read through the decisions' own consumers: whether the call is held to the
 * model's last view of the net, what a failed call says of the document,
 * whether its result counts as a call Petrinaut ran on the net, what of the
 * net a settled result shows the model, and how the HASH agent shows its
 * output.
 */
import { describe, expect, test } from "vitest";

import {
  browserToolFacts,
  brunchTools,
  canonicalContent,
} from "@hashintel/brunch-agent";

import { createBrunchContextProjection } from "./context-projection.ts";
import {
  claimBrowserCall,
  failBrowserCall,
  issueBrowserCall,
} from "./conversation/browser-call-rendezvous.ts";
import { netCalls } from "./conversation/net-changes.ts";
import { netResultView } from "./conversation/net-view.ts";

import type { ContextProjectionEntry } from "@flue/runtime";
import type { FlueConversationSnapshot } from "@flue/sdk";

interface ServerSide {
  /** Issued against the model's last view of the net (both agents' executors). */
  readonly freshView: boolean;
  /** What a claimed call that then failed tells the model of the document. */
  readonly onFailure: "unchanged" | "unknown";
  /** Counted among the calls Petrinaut ran on the net. */
  readonly netCall: boolean;
  /** What a successful result carrying revisions and a read-back shows of the net. */
  readonly netView: "read" | "change" | "nothing";
  /** How the HASH agent's projection shows a string output. */
  readonly hashAgentShowsString: "as-text" | "as-json";
}

// The one fact the test reads directly: both agents' executors read it inline.
const freshViewOf = (toolName: string) =>
  browserToolFacts(toolName).requiresFreshView;

// The HASH agent's context projection, as it configures it.
const hashAgentProjection = createBrunchContextProjection();

const binding = canonicalContent({
  conversationId: "conversation",
  documentId: "document",
});

const onFailureOf = async (
  toolName: string,
): Promise<ServerSide["onFailure"]> => {
  const call = {
    instanceId: "characterization",
    toolCallId: crypto.randomUUID(),
    toolName,
    canonicalInput: {},
    binding,
  };
  const result = issueBrowserCall(call);
  const claim = claimBrowserCall(call.instanceId, call.toolCallId, binding);
  if (!claim) throw new Error("The issued call was not claimable.");
  failBrowserCall({
    ...call,
    capability: claim.capability,
    disposition: "failed",
  });
  const error = await result.then(
    () => undefined,
    (failure: unknown) => failure,
  );
  if (!(error instanceof Error)) throw new Error("The failed call resolved.");
  if (error.message.includes("the document is unchanged")) return "unchanged";
  if (error.message.includes("effect is unknown")) return "unknown";
  throw new Error(`Unexpected failure: ${error.message}`);
};

const metadata = {
  documentRevision: { before: "revision-1", after: "revision-2" },
  readBack: {
    places: [],
    transitions: [],
    types: [],
    differentialEquations: [],
    parameters: [],
  },
};

const isNetCall = (toolName: string): boolean =>
  netCalls({
    v: 1,
    conversationId: "conversation",
    offset: "1",
    settlements: [],
    messages: [
      {
        id: "assistant-1",
        role: "assistant",
        purpose: "assistant",
        display: "visible",
        parts: [
          {
            type: "dynamic-tool",
            toolName,
            toolCallId: "call",
            state: "output-available",
            input: {},
            output: { brunchBrowserResult: true, output: {}, metadata },
          },
        ],
      },
    ],
  } as FlueConversationSnapshot).length === 1;

const hashAgentShowsStringOf = (
  toolName: string,
): ServerSide["hashAgentShowsString"] => {
  const output = "rendered for the model";
  const entry: ContextProjectionEntry = {
    id: "result",
    message: {
      role: "toolResult",
      toolCallId: "call",
      toolName,
      isError: false,
      content: [
        {
          type: "text",
          text: JSON.stringify({ brunchBrowserResult: true, output }),
        },
      ],
    },
  };
  const [projected] = hashAgentProjection([entry]);
  const content =
    projected?.message.role === "toolResult"
      ? projected.message.content
      : undefined;
  return content?.[0]?.type === "text" && content[0].text === output
    ? "as-text"
    : "as-json";
};

const serverSideOf = async (toolName: string): Promise<ServerSide> => ({
  freshView: freshViewOf(toolName),
  onFailure: await onFailureOf(toolName),
  netCall: isNetCall(toolName),
  netView: netResultView(toolName, metadata)?.kind ?? "nothing",
  hashAgentShowsString: hashAgentShowsStringOf(toolName),
});

const change: ServerSide = {
  freshView: true,
  onFailure: "unknown",
  netCall: true,
  netView: "change",
  hashAgentShowsString: "as-json",
};

const hashRead: ServerSide = {
  freshView: false,
  onFailure: "unchanged",
  netCall: false,
  netView: "nothing",
  hashAgentShowsString: "as-text",
};

describe("what the server decides about each tool it issues to the browser", () => {
  test.each<[string, ServerSide]>([
    // Canonical Petrinaut tools, one per capability, and both kinds of read.
    ["addPlace", change],
    ["applyAutoLayout", change],
    // HASH's Petrinaut tools are their canonical operation's change.
    ["petrinaut_create_place", change],
    ["petrinaut_update_arc", change],
    ["petrinaut_remove_place", change],
    ["petrinaut_set_net_title", change],
    ["petrinaut_layout_auto", change],
    // Every detail of HASH's net read is a read of the net.
    [
      "petrinaut_get_net",
      {
        freshView: false,
        onFailure: "unchanged",
        netCall: true,
        netView: "read",
        hashAgentShowsString: "as-json",
      },
    ],
    ...(
      ["petrinaut_get_diagnostics", "petrinaut_create_experiment"] as const
    ).map((name): [string, ServerSide] => [
      name,
      {
        freshView: false,
        onFailure: "unchanged",
        netCall: true,
        netView: "nothing",
        hashAgentShowsString: "as-json",
      },
    ]),
    [
      "getLatestNetDefinition",
      {
        freshView: false,
        onFailure: "unchanged",
        netCall: true,
        netView: "read",
        hashAgentShowsString: "as-json",
      },
    ],
    [
      "getNetCompilationErrors",
      {
        freshView: false,
        onFailure: "unchanged",
        netCall: true,
        netView: "nothing",
        hashAgentShowsString: "as-json",
      },
    ],
    [
      "createExperiment",
      {
        freshView: false,
        onFailure: "unchanged",
        netCall: true,
        netView: "nothing",
        hashAgentShowsString: "as-json",
      },
    ],
    // The filtered net readers.
    ...(["readNetOutline", "readNetStructure"] as const).map(
      (name): [string, ServerSide] => [
        name,
        {
          freshView: false,
          onFailure: "unchanged",
          netCall: true,
          netView: "read",
          hashAgentShowsString: "as-json",
        },
      ],
    ),
    [
      brunchTools.draftPetrinautExperiment,
      {
        freshView: false,
        onFailure: "unchanged",
        netCall: false,
        netView: "nothing",
        hashAgentShowsString: "as-json",
      },
    ],
    [brunchTools.queryHashEntities, hashRead],
    [brunchTools.queryHashEntityTypes, hashRead],
    [brunchTools.queryHashWebs, hashRead],
    [
      brunchTools.saveHashNet,
      {
        freshView: true,
        onFailure: "unknown",
        netCall: false,
        // Save writes a version but records no document change.
        netView: "nothing",
        hashAgentShowsString: "as-json",
      },
    ],
    // A tool the server never issues counts as a possible change.
    [
      "unmounted_tool",
      {
        freshView: true,
        onFailure: "unknown",
        netCall: false,
        netView: "nothing",
        hashAgentShowsString: "as-json",
      },
    ],
  ])("%s", async (toolName, expected) => {
    expect(await serverSideOf(toolName)).toEqual(expected);
  });
});

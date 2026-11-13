/**
 * Probe-local scaffolding for HASH port unit H0b (`hash-agent-port.md` §6):
 * a Harness opened as the server's conversation registry opens one (a host
 * binding, a registry built over it, `Harness.open`, then `bind`), stand-ins
 * for the HASH pieces that do not exist yet, and the I1 check.
 *
 * Nothing here is product code. The stand-ins:
 * - `petrinaut_create_place` renders a change with its read-back through the
 *   successor's own `renderBrowserResult`, so the real pruning hook and
 *   `visibleNetView` read it as they read a browser change; unlike a browser
 *   tool, it can ask to end the run.
 * - `ledger_commit` holds its call open until released and asks to end the
 *   run when `endTurn` is set: fold 7's `terminate`, without the Ledger or
 *   the reply-evidence check.
 * - `app_save_net` is a Save extension whose description names a
 *   `documentId`, installed under one extension name in two versions: a
 *   placeholder before the binding is known, and the bound one.
 */
import { awaitWithContext } from "@earendil-works/chord/context";
import {
  type Conversation,
  createRegistry,
  defineExtension,
  defineTool,
  type EntryRecord,
  type Extension,
  Harness,
  type Registry,
  type Storage,
  type ToolExecutionResult,
} from "@earendil-works/pi-durable";
import { bool, obj, str } from "@earendil-works/pi-schema";
import { expect } from "vitest";

import { brunchTools } from "@hashintel/brunch-agent";

import {
  createHostBinding,
  type HostBinding,
} from "../../../src/agent/host-binding";
import { renderBrowserResult } from "../../../src/net-state/visible-net-view";
import { context } from "../support";

import type { Message } from "@earendil-works/pi-ai";
import type { Models } from "@earendil-works/pi-ai/models";

// ─── Opening a conversation's Harness ────────────────────────────────────────

export type OpenedHarness = {
  readonly harness: Harness;
  readonly host: HostBinding;
  readonly registry: Registry;
};

/**
 * In `conversation-registry.ts`'s order: the host binding, the registry built
 * over it, `Harness.open` (which schedules nothing), then `bind`. `afterBind`
 * runs next, before anything enables scheduling: the point where H8 installs
 * the bound Save on open.
 */
export const openHarness = async (
  storage: Storage,
  models: Models,
  extensions: (host: HostBinding) => readonly Extension[],
  afterBind?: (opened: OpenedHarness) => Promise<void>,
): Promise<OpenedHarness> => {
  const host = createHostBinding();
  const registry = createRegistry();
  for (const extension of extensions(host)) registry.install(extension);
  const harness = await Harness.open(storage, { models, registry }, context);
  host.bind(harness);
  const opened = { harness, host, registry };
  await afterBind?.(opened);
  return opened;
};

// ─── Stand-in net change ─────────────────────────────────────────────────────

/** HASH's create-place tool: a net change whose result can show the net. */
export const createPlaceToolName = "petrinaut_create_place";

export const definitionAt = (revision: string) => ({
  places: [{ id: "place-dryer", name: "Dryer" }],
  transitions: [],
  revision,
});

/** A change from `before` to `after` with its read-back, rendered as the successor renders a browser change. */
export const changeText = (before: string, after: string) =>
  renderBrowserResult(
    createPlaceToolName,
    { applied: true },
    { documentRevision: { before, after }, readBack: definitionAt(after) },
  );

/** The change's bare output, as the pruning write leaves it. */
export const prunedChangeText = JSON.stringify({ applied: true });

const createPlaceTool = defineTool({
  name: createPlaceToolName,
  description: "Stand-in: creates a place and reads the net back.",
  parameters: obj({ before: str(), after: str(), endTurn: bool() }),
  execute: async ({
    before,
    after,
    endTurn,
  }): Promise<ToolExecutionResult> => ({
    output: [{ type: "text", text: changeText(before, after) }],
    ...(endTurn ? { control: { terminate: true } } : {}),
  }),
});

/** `petrinaut_create_place` call arguments. */
export const createPlace = (
  before: string,
  after: string,
  endTurn = false,
) => ({
  before,
  after,
  endTurn,
});

// ─── Stand-in Ledger commit ──────────────────────────────────────────────────

/** A `ledger_commit` that waits for `release()`; `started` resolves once it waits. */
export const heldCommitTool = () => {
  let release: () => void = () => undefined;
  let started: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  const tool = defineTool({
    name: brunchTools.ledgerCommit,
    description: "Stand-in: records a commit; endTurn ends the turn.",
    parameters: obj({ endTurn: bool() }),
    // As the real tool.
    executionMode: "sequential",
    execute: async (
      { endTurn },
      _api,
      toolContext,
    ): Promise<ToolExecutionResult> => {
      started();
      await awaitWithContext(gate, toolContext);
      return {
        output: [
          { type: "text", text: JSON.stringify({ status: "recorded" }) },
        ],
        ...(endTurn ? { control: { terminate: true } } : {}),
      };
    },
  });
  return { tool, release: () => release(), started: waiting };
};

/** The stand-in change and a held commit, in one extension. */
export const netToolsExtension = (commit: ReturnType<typeof heldCommitTool>) =>
  defineExtension({
    name: "probe.hash-net-tools",
    tools: [createPlaceTool, commit.tool],
  });

// ─── Stand-in Save ───────────────────────────────────────────────────────────

/** One name for every version, so a conversation's stored selection always resolves. */
export const saveExtensionName = "probe.hash-save";

export const placeholderSaveDescription =
  "Save the net open in the editor to HASH as a new version. The editor is not known yet.";

/** Save's description for a bound conversation: it names the open net's `documentId`, as Brunch's does. */
export const boundSaveDescription = (documentId: string) =>
  `Save the net open in the editor to HASH as a new version. The net open in the editor is documentId ${JSON.stringify(documentId)}.`;

export const saveExtension = (description: string) =>
  defineExtension({
    name: saveExtensionName,
    tools: [
      defineTool({
        name: brunchTools.appSaveNet,
        description,
        parameters: obj({ documentId: str() }),
        execute: async () => ({
          output: [
            {
              type: "text",
              text: JSON.stringify({ saved: false, reason: "probe" }),
            },
          ],
        }),
      }),
    ],
  });

// ─── Reading requests and entries ────────────────────────────────────────────

/** System messages in a request that change the offered tools. */
export const toolDeltas = (messages: readonly Message[]) =>
  messages.flatMap((message) =>
    message.role === "system" &&
    ((message.toolsAdded?.length ?? 0) > 0 ||
      (message.toolsRemoved?.length ?? 0) > 0)
      ? [
          {
            added: (message.toolsAdded ?? []).map(({ name }) => name),
            removed: (message.toolsRemoved ?? []).map(({ name }) => name),
          },
        ]
      : [],
  );

/** I1: each request equals the committed effective context as of the newest entry before its answer. */
export const expectI1 = async (
  conversation: Conversation,
  entries: readonly EntryRecord[],
  requests: readonly Message[][],
) => {
  const answers = entries.filter(({ kind }) => kind === "pi.assistant");
  expect(requests).toHaveLength(answers.length);
  await Promise.all(
    answers.map(async (answer, index) => {
      const before = entries[entries.indexOf(answer) - 1];
      if (before === undefined) throw new Error("No entry before an answer.");
      expect(requests[index]).toEqual(
        (await conversation.context(context, { at: before.id })).messages,
      );
    }),
  );
};

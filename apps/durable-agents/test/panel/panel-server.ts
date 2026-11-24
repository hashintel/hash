/**
 * The durable agents server as the panel tests open it: built with
 * `createDurableAgentsServer`, in-process over SQLite, with the browser-call
 * routes mounted where `startDurableAgentsServer` mounts them, and a new
 * conversation admitted and bound as it admits one; and the panel's
 * connection to it, recording every request. HASH's entry is left out, so
 * the conversation and web headers arrive unchecked.
 */
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { createRegistry, type Extension } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { afterEach } from "vitest";

import {
  successorEndpoints,
  type SuccessorConversation,
} from "@hashintel/brunch-agent/client";

import {
  browserCallExtension,
  browserToolName,
  claimBrowserCall,
  finishBrowserCall,
} from "../../src/browser-call/browser-call";
import { createBrowserCallRouter } from "../../src/browser-call/browser-call-router";
import { createDurableAgentsServer } from "../../src/server/durable-agents-server";
import {
  admitNewConversation as admitByBinding,
  browserCallsPrefix,
} from "../../src/server/start-durable-agents-server";
import { context } from "../platform/support";
import { scriptedModel } from "../scripted-model";

import type { HostBinding } from "../../src/agent/host-binding";
import type { OwnedStorage } from "../../src/server/conversation-storage";
import type { DurableAgentsServerOptions } from "../../src/server/durable-agents-server";
import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";
import type { BrowserContext } from "@hashintel/brunch-agent";

export const origin = "http://durable.test";
export const actorKey = "test-actor";
export const conversationId = "net-1:construction";
export const documentId = "net-1";
export const web = "web-1";
/** The panel's binding, in the shape `useProcessAgentBinding` gives it. */
export const binding: BrowserContext["binding"] = {
  conversationId,
  documentId,
  incarnationId: documentId,
};

const servers: { close: () => Promise<void> }[] = [];
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

/** A directory of its own for one test's conversations, removed after it. */
export const temporaryDirectory = async () => {
  const directory = await mkdtemp(join(tmpdir(), "panel-"));
  directories.push(directory);
  return directory;
};

/** Each conversation in its own SQLite file under `directory`, owned by this one process. */
const sqliteConversations = (directory: string) => {
  const fileOf = (id: string) => join(directory, `${id}.sqlite`);
  const opened = new Map<string, Promise<OwnedStorage>>();
  return {
    openStorage: (id: string): Promise<OwnedStorage> => {
      const existing = opened.get(id);
      if (existing !== undefined) return existing;
      const storage = openNodeSqliteStorage(fileOf(id)).then((sqlite) =>
        Object.assign(sqlite, { isOwner: async () => true }),
      );
      opened.set(id, storage);
      return storage;
    },
    storageExists: (id: string) =>
      access(fileOf(id)).then(
        () => true,
        () => false,
      ),
  };
};

/** A request the panel sent, and the status of its answer once one arrived. */
export type RecordedRequest = {
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
  readonly credentials: RequestCredentials | undefined;
  readonly body: unknown;
  status?: number;
};

/** Answers a request in the server's place, or `forward`s it and acts on the answer; `undefined` forwards it. */
export type PanelIntercept = (
  url: string,
  init: RequestInit | undefined,
  forward: () => Promise<Response>,
) => Promise<Response> | undefined;

/**
 * The server, whose model answers `responses` and may call `setNetTitle`, a
 * tool the browser runs that streams as a dynamic tool, beside the tools of
 * `extensions`; and the panel's connection to it, through `intercept`.
 * `directory` holds the conversations, a fresh one when omitted.
 */
export const openPanelServer = async (
  responses: FauxResponseStep[],
  {
    directory,
    extensions = () => [],
    admitNewConversation = admitByBinding,
    intercept,
  }: {
    readonly directory?: string;
    readonly extensions?: (host: HostBinding) => readonly Extension[];
    readonly admitNewConversation?: DurableAgentsServerOptions["admitNewConversation"];
    readonly intercept?: PanelIntercept;
  } = {},
) => {
  /** The Harness clock: the wall clock, unless a test moves it on. */
  const clock = { now: Date.now() };
  const now = () => Math.max(clock.now, Date.now());
  const { models, model } = scriptedModel(responses);
  const server = createDurableAgentsServer({
    now,
    ...sqliteConversations(directory ?? (await temporaryDirectory())),
    createRegistry: (host) => {
      const registry = createRegistry();
      registry.install(browserCallExtension);
      for (const extension of extensions(host)) registry.install(extension);
      return registry;
    },
    models,
    agent: { model },
    clientToolNames: new Set([browserToolName]),
    dynamicClientToolNames: new Set([browserToolName]),
    admitNewConversation,
    context,
  });
  server.app.route(
    browserCallsPrefix,
    createBrowserCallRouter({
      resolveHarness: async (id) =>
        (await server.conversations.acquire(id))?.harness,
      now,
    }),
  );
  servers.push(server);
  const requests: RecordedRequest[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    const request: RecordedRequest = {
      url,
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      credentials: init?.credentials,
      body:
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as unknown)
          : undefined,
    };
    requests.push(request);
    const forward = async () => server.app.request(url, init);
    const response = await (intercept?.(url, init, forward) ?? forward());
    request.status = response.status;
    return response;
  };
  const conversation: SuccessorConversation = {
    endpoint: origin,
    actorKey,
    conversationId,
    web,
    fetch,
  };
  const endpoints = await successorEndpoints(conversation);
  return { server, clock, conversation, endpoints, requests, fetch };
};

export type PanelServer = Awaited<ReturnType<typeof openPanelServer>>;

/**
 * Claim and finish `toolCallId`'s browser call through the server's own
 * claim, as a browser would, once the tool task has issued it. `onClaimed`
 * runs between the claim and the result.
 */
export const answerAsBrowser = async (
  { server, endpoints }: PanelServer,
  toolCallId: string,
  output: Parameters<typeof finishBrowserCall>[1]["output"],
  {
    metadata,
    onClaimed = () => {},
  }: {
    readonly metadata?: Parameters<typeof finishBrowserCall>[1]["metadata"];
    readonly onClaimed?: () => void;
  } = {},
) => {
  for (;;) {
    // eslint-disable-next-line no-await-in-loop -- Each try follows the last.
    const open = await server.conversations.acquire(endpoints.instanceId);
    if (open !== undefined) {
      const { harness, root } = open;
      // eslint-disable-next-line no-await-in-loop -- Each try follows the last.
      const claim = await claimBrowserCall(
        harness,
        root.id,
        toolCallId,
        context,
        Date.now,
      );
      if (claim !== undefined) {
        onClaimed();
        return finishBrowserCall(
          harness,
          {
            conversationId: root.id,
            toolCallId,
            toolName: claim.toolName,
            capability: claim.capability,
            canonicalInput: claim.input,
            output,
            metadata,
          },
          context,
          Date.now,
        );
      }
    }
    // The tool task issues the call after its assistant entry commits.
    // eslint-disable-next-line no-await-in-loop -- Each try follows the last.
    await sleep(5);
  }
};

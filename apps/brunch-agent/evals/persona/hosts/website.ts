/**
 * Brunch on the Petrinaut website: the run starts its own panel and chat
 * servers on free ports, and the website keeps its nets and settings in the
 * panel origin's `localStorage`, so a resume returns to that origin.
 */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import * as v from "valibot";

import {
  brunchActorKeyStorageKey,
  sdcpnInitialDataSchema,
} from "@hashintel/brunch-agent";
import { toPetrinautId } from "@hashintel/petrinaut-core";

import { brunchEnv } from "../../../src/env.ts";
import { petrinautAgentGuidance } from "../guidance-manifest.ts";
import { refreshProofManifest } from "../proof-artifacts.ts";
import { interviewLengthStorage } from "./website/interview-length.ts";
import {
  personaAliasName,
  registerPortlessAlias,
} from "./website/portless-alias.ts";
import { localOrigin, resolvePersonaPorts } from "./website/ports.ts";

import type { PersonaBrowserSession } from "../browser-turn.ts";
import type { PersonaHost } from "../host.ts";
import type { Page } from "@playwright/test";

/** The website's own key for its stored nets. */
const netStorageKey = "petrinaut-sdcpn";

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The document a website conversation is bound to, from what it sent. */
export const documentIdFromInitialData = (
  initialData: unknown,
): string | undefined => {
  if (!record(initialData)) return undefined;
  const binding = record(initialData.binding) ? initialData.binding : undefined;
  return typeof binding?.documentId === "string"
    ? binding.documentId
    : undefined;
};

const netArray = v.array(v.unknown());
/** The website opens only stored entries of this shape and skips the rest. */
const storedNetSchemaWith = ({ documentId }: { documentId: string }) =>
  v.object({
    id: v.literal(documentId),
    title: v.string(),
    lastUpdated: v.string(),
    sdcpn: v.object({
      places: netArray,
      transitions: netArray,
      types: netArray,
      parameters: netArray,
      differentialEquations: netArray,
    }),
  });

/** Loads the app through the normal UI and shows the AI panel; nothing is sent. */
const showPanel = async (page: Page, origin: string, route: string) => {
  await page.goto(new URL(route, origin).href);
  const skipTour = page.getByRole("button", { name: "Skip tour" });
  await skipTour.waitFor();
  await skipTour.click();
  await page
    .getByRole("button", { name: "Show AI assistant", exact: true })
    .click();
};

/** Checks the retained origin's storage before loading the application, which may create defaults. */
export const openRetainedPersonaBrowser = async (
  page: Page,
  origin: string,
  route: string,
  session: PersonaBrowserSession,
) => {
  // A non-app document gives access to the same origin without mounting the editor.
  const checkUrl = new URL("/__persona_identity_check__", origin).href;
  await page.route(checkUrl, (request) =>
    request.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Checking original persona document</title>",
    }),
  );
  await page.goto(checkUrl);
  await page.unroute(checkUrl);
  const saved = await page.evaluate(
    ({ actorStorageKey, netsStorageKey }) => ({
      actorKey: localStorage.getItem(actorStorageKey),
      documents: JSON.parse(
        localStorage.getItem(netsStorageKey) ?? "{}",
      ) as unknown,
    }),
    {
      actorStorageKey: brunchActorKeyStorageKey,
      netsStorageKey: netStorageKey,
    },
  );
  const data = v.parse(sdcpnInitialDataSchema, session.initialData);
  assert(data);
  const binding = data.binding;
  assert.equal(binding.conversationId, session.conversationId);
  assert.equal(
    saved.actorKey,
    session.actorKey,
    "Original browser actor key is missing or changed",
  );
  const documents = v.parse(v.record(v.string(), v.unknown()), saved.documents);
  const stored = documents[binding.documentId];
  assert.ok(stored !== undefined, "Original browser document is missing");
  assert.ok(
    v.is(storedNetSchemaWith({ documentId: binding.documentId }), stored),
    "Original browser document is not a net the website opens",
  );
  await page.goto(new URL(route, origin).href);
};

/** Writes the website's stored document into the run's evidence. */
const retainDocument = async (
  page: Page,
  documentId: string,
  evidenceDirectory: string,
) => {
  const document = await page.evaluate(
    ({ id, storageKey }) => {
      const raw = localStorage.getItem(storageKey);
      if (raw === null) return undefined;
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      )
        return undefined;
      return (parsed as Record<string, unknown>)[id];
    },
    { id: documentId, storageKey: netStorageKey },
  );
  if (!record(document) || !record(document.sdcpn))
    throw new Error(
      `The persona browser has no retained Petrinaut document ${documentId}.`,
    );
  await writeFile(
    join(evidenceDirectory, "net.json"),
    `${JSON.stringify(document, null, 2)}\n`,
  );
  await refreshProofManifest(evidenceDirectory);
};

/** A fresh run's options; a resume takes them back from its run. */
export const websiteHost = ({
  route: freshRoute = "/",
  interviewLength,
}: {
  readonly route?: string;
  /** A level for the website's Interview length; omitted leaves it off. */
  readonly interviewLength?: string;
} = {}): PersonaHost => ({
  name: "website",
  guidance: petrinautAgentGuidance,
  prepare: async ({ environment, run, retained, report }) => {
    const retainedOrigin =
      typeof retained?.panelOrigin === "string"
        ? retained.panelOrigin
        : undefined;
    if (retained !== undefined && retainedOrigin === undefined)
      throw new Error("This run recorded no panel origin; it cannot resume.");
    const route =
      typeof retained?.route === "string" ? retained.route : freshRoute;
    const ports = await resolvePersonaPorts({
      environment,
      resumePanelOrigin: retainedOrigin,
    });
    const panelOrigin = localOrigin(ports.panel);
    const chatOrigin = localOrigin(ports.chat);
    if (retainedOrigin !== undefined && panelOrigin !== retainedOrigin)
      throw new Error(
        `Resume requires the original panel origin ${retainedOrigin}; unset ${brunchEnv.panelPort} or set it accordingly`,
      );
    const storage =
      interviewLength === undefined
        ? undefined
        : interviewLengthStorage(interviewLength);
    const removeAlias = await registerPortlessAlias(
      personaAliasName(run),
      ports.panel,
      report,
    );
    return {
      record: {
        panelOrigin,
        route,
        ...(interviewLength === undefined ? {} : { interviewLength }),
      },
      environment: {
        ...environment,
        [brunchEnv.chatPort]: String(ports.chat),
        [brunchEnv.panelPort]: String(ports.panel),
      },
      services: [
        {
          script: "dev:brunch:server",
          readyUrl: `${chatOrigin}/health`,
          recovers: true,
        },
        { script: "dev:brunch:panel", readyUrl: panelOrigin, recovers: false },
      ],
      buildFilters: ["@apps/brunch-agent^...", "@apps/petrinaut-website^..."],
      open: async (page, { initialNet }) => {
        if (initialNet !== undefined) {
          const id = toPetrinautId(
            `persona-source-${initialNet.sourceSha256.slice(0, 12)}`,
          );
          const serialized = JSON.stringify({
            [id]: {
              id,
              lastUpdated: new Date().toISOString(),
              sdcpn: initialNet.sdcpn,
              title: initialNet.title,
            },
          });
          await page.addInitScript(
            ({ value, storageKey }) => localStorage.setItem(storageKey, value),
            { value: serialized, storageKey: netStorageKey },
          );
        }
        if (storage !== undefined)
          await page.addInitScript((entries) => {
            for (const [key, value] of Object.entries(entries))
              localStorage.setItem(key, value);
          }, storage);
        await showPanel(page, panelOrigin, route);
        return {};
      },
      reopen: async (page, session) => {
        assert.equal(
          new URL(session.url).origin,
          panelOrigin,
          "session.json names another panel",
        );
        await openRetainedPersonaBrowser(page, panelOrigin, route, session);
      },
      reload: async (page) => {
        await page.reload();
        await page
          .getByRole("button", { name: "Show AI assistant", exact: true })
          .click();
        await page
          .getByRole("textbox", { name: "Message AI assistant", exact: true })
          .waitFor();
      },
      capture: async (page, session, evidenceDirectory) => {
        const documentId = documentIdFromInitialData(session.initialData);
        if (documentId !== undefined)
          await retainDocument(page, documentId, evidenceDirectory);
      },
      release: async () => {
        await removeAlias?.();
      },
    };
  },
});

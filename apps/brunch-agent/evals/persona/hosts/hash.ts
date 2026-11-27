/**
 * Brunch inside the HASH app: the persona talks to the HASH agent in the
 * process editor, signed in as a seeded user. The HASH stack (compose, graph,
 * hash-api, frontend) is shared across the machine and only checked here; the
 * run starts its own Brunch server at the origin the frontend was started
 * with, so one HASH persona run uses the machine at a time.
 */
import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { parseSDCPNFile } from "@hashintel/petrinaut-core";

import { brunchEnv } from "../../../src/env.ts";
import { hashAgentGuidance } from "../guidance-manifest.ts";
import { refreshProofManifest } from "../proof-artifacts.ts";

import type { PersonaHost } from "../host.ts";
import type { Page } from "@playwright/test";

/** The page and Brunch share the host name, or the session cookie stays home. */
export const hashOrigins = {
  frontend: "http://localhost:3000",
  api: "http://localhost:5001",
  /** The frontend reads it from `HASH_BRUNCH_AGENT_ORIGIN` when it starts. */
  brunch: "http://localhost:4321",
} as const;

/** Seeded by hash-api in development (`seed-users.ts`). */
const seededUser = { email: "alice@example.com", password: "password" };

const petriNetEntityTypeId =
  "https://hash.ai/@h/types/entity-type/petri-net/v/1";
const definitionProperty =
  "https://hash.ai/@h/types/property-type/definition-object/";
const titleProperty = "https://hash.ai/@h/types/property-type/title/";
const objectDataType =
  "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1";
const textDataType =
  "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1";

/**
 * Refuses, saying what to start, when the shared stack is not answering or
 * the frontend was started without this Brunch origin, which it fixes in its
 * content security policy when it starts.
 */
const checkHashStack = async (signal: AbortSignal) => {
  const answer = (url: string) =>
    fetch(url, { signal }).then(
      (response) => response,
      () => undefined,
    );
  const [frontend, api] = await Promise.all([
    answer(hashOrigins.frontend),
    answer(`${hashOrigins.api}/`),
  ]);
  const start = `Start \`yarn compose up\`, \`yarn start:graph\`, \`yarn dev:backend:api\` and \`HASH_BRUNCH_AGENT_ORIGIN=${hashOrigins.brunch} yarn dev:frontend\`.`;
  const missing = [
    ...(frontend === undefined ? ["frontend"] : []),
    ...(api === undefined ? ["hash-api"] : []),
  ];
  if (missing.length > 0)
    throw new Error(
      `The HASH stack is not answering (${missing.join(", ")}). ${start}`,
    );
  if (
    !(frontend?.headers.get("content-security-policy") ?? "").includes(
      hashOrigins.brunch,
    )
  )
    throw new Error(
      `The HASH frontend was not started with HASH_BRUNCH_AGENT_ORIGIN=${hashOrigins.brunch}, so its page cannot reach this run's Brunch. Restart it: ${start}`,
    );
};

/** Signs the seeded user in through the app's own form. */
const signIn = async (page: Page) => {
  await page.goto(new URL("/signin", hashOrigins.frontend).href);
  await page.fill('[placeholder="Enter your email address"]', seededUser.email);
  await page.fill('[placeholder="Enter your password"]', seededUser.password);
  await page.click("text=Submit");
  await page.waitForURL((url) => !url.pathname.startsWith("/signin"));
};

/** One hash-api GraphQL operation as the page's signed-in user. */
const hashGraphql = async (
  page: Page,
  query: string,
  variables: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const body = await page.evaluate(
    async (request) => {
      const response = await fetch(`${request.api}/graphql`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: request.query,
          variables: request.variables,
        }),
      });
      return (await response.json()) as {
        data?: Record<string, unknown> | null;
        errors?: unknown;
      };
    },
    { api: hashOrigins.api, query, variables },
  );
  if (!body.data)
    throw new Error(`hash-api refused: ${JSON.stringify(body.errors)}`);
  return body.data;
};

/**
 * Saves a process as the signed-in user, as the editor's Save does, and
 * returns its entity uuid. Brunch only joins a saved process.
 */
const createProcess = async (
  page: Page,
  { title, definition }: { title: string; definition: unknown },
): Promise<string> => {
  const data = await hashGraphql(
    page,
    "mutation createEntity($entityTypeIds: [VersionedUrl!]!, $properties: PropertyObjectWithMetadata!) { createEntity(entityTypeIds: $entityTypeIds, properties: $properties) }",
    {
      entityTypeIds: [petriNetEntityTypeId],
      properties: {
        value: {
          [definitionProperty]: {
            metadata: { dataTypeId: objectDataType },
            value: definition,
          },
          [titleProperty]: {
            metadata: { dataTypeId: textDataType },
            value: title,
          },
        },
      },
    },
  );
  const created = data.createEntity as {
    metadata?: { recordId?: { entityId?: string } };
  };
  const entityUuid = created.metadata?.recordId?.entityId?.split("~")[1];
  if (entityUuid === undefined)
    throw new Error(`createEntity named no entity: ${JSON.stringify(created)}`);
  return entityUuid;
};

/**
 * The process's latest saved version, in the shape the website stores a net,
 * which the run packet reads; `undefined` once the process is archived.
 */
const readProcess = async (page: Page, entityUuid: string) => {
  const data = await hashGraphql(
    page,
    "query queryEntities($request: QueryEntitiesRequest!) { queryEntities(request: $request) }",
    {
      request: {
        filter: {
          all: [
            { equal: [{ path: ["uuid"] }, { parameter: entityUuid }] },
            { equal: [{ path: ["archived"] }, { parameter: false }] },
          ],
        },
        temporalAxes: {
          pinned: { axis: "transactionTime", timestamp: null },
          variable: {
            axis: "decisionTime",
            interval: { start: null, end: null },
          },
        },
        includeDrafts: false,
        includePermissions: false,
      },
    },
  );
  const [entity] =
    (data.queryEntities as { entities?: unknown[] }).entities ?? [];
  if (entity === undefined) return undefined;
  const { properties, metadata } = entity as {
    properties?: Record<string, unknown>;
    metadata?: {
      temporalVersioning?: { decisionTime?: { start?: { limit?: string } } };
    };
  };
  assert(properties, `hash-api returned no process ${entityUuid}`);
  return {
    id: entityUuid,
    title: properties[titleProperty],
    lastUpdated: metadata?.temporalVersioning?.decisionTime?.start?.limit,
    sdcpn: properties[definitionProperty],
  };
};

/**
 * How long the frontend may take to show the assistant. The launcher's build
 * of Brunch's dependencies rewrites files the dev server watches, so the first
 * page after it can wait on a recompile and reload once it is done.
 */
const settleMs = 180_000;

/** Shows the assistant once the panel has joined Brunch; nothing is sent. */
const showAssistant = async (page: Page, load: () => Promise<unknown>) => {
  // The panel joins Brunch once its conversation history has loaded; a
  // click before then opens an empty panel.
  const history = page.waitForResponse(
    (response) =>
      response.url().startsWith(hashOrigins.brunch) &&
      new URL(response.url()).searchParams.get("view") === "history",
    { timeout: settleMs },
  );
  await load();
  await history;
  const composer = page.getByRole("textbox", {
    name: "Message AI assistant",
    exact: true,
  });
  const show = page.getByRole("button", {
    name: "Show AI assistant",
    exact: true,
  });
  const deadline = Date.now() + settleMs;
  // A reload during the recompile hides the panel again; show it whenever
  // the button is what the page offers, until the composer is there.
  // eslint-disable-next-line no-await-in-loop -- Each step waits on what the page shows next.
  while (!(await composer.isVisible())) {
    const timeout = deadline - Date.now();
    if (timeout <= 0)
      throw new Error(
        `The HASH frontend did not show the assistant within ${settleMs / 1000}s`,
      );
    // eslint-disable-next-line no-await-in-loop -- As above.
    await composer.or(show).first().waitFor({ timeout });
    // The toolbar around the button can keep moving after a reload, which
    // Playwright's stability check never sees settle; the composer check
    // below confirms the click took.
    // eslint-disable-next-line no-await-in-loop -- As above.
    if (await show.isVisible()) await show.click({ force: true, timeout });
    // eslint-disable-next-line no-await-in-loop -- As above.
    await composer
      .waitFor({ timeout: Math.min(15_000, timeout) })
      .catch(() => {});
  }
};

/**
 * The net the editor holds now, saved or not, through the editor's own
 * Export > JSON: a download, so neither the editor's state nor anything the
 * agent reads changes.
 */
const exportLiveNet = async (
  page: Page,
  entityUuid: string,
  timeout?: number,
) => {
  const download = page.waitForEvent("download", { timeout });
  // A failed click leaves the download wait to reject unobserved.
  download.catch(() => {});
  await page
    .getByRole("button", { name: "Menu", exact: true })
    .click({ timeout });
  await page
    .getByRole("menuitem", { name: "Export", exact: true })
    .click({ timeout });
  await page
    .getByRole("menuitem", { name: "JSON", exact: true })
    .click({ timeout });
  const path = await (await download).path();
  const parsed = parseSDCPNFile(JSON.parse(await readFile(path, "utf8")));
  if (!parsed.ok)
    throw new Error(`The editor exported no readable net: ${parsed.error}`);
  const { title, ...sdcpn } = parsed.sdcpn;
  return { id: entityUuid, title, exportedAt: new Date().toISOString(), sdcpn };
};

const processUrl = (entityUuid: string) =>
  new URL(`/environments/${entityUuid}`, hashOrigins.frontend).href;

/**
 * Written to the run directory when a capture fails and removed by the next
 * that succeeds: while it stands, `evidence/net.json` is not the live net.
 */
const captureFailedFile = "net-capture-failed.json";

const emptyNet = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

export const hashHost = (): PersonaHost => ({
  name: "hash",
  guidance: hashAgentGuidance,
  prepare: async ({ environment, run, retained, signal }) => {
    await checkHashStack(signal);
    let entityUuid =
      typeof retained?.entityUuid === "string"
        ? retained.entityUuid
        : undefined;
    if (retained !== undefined && entityUuid === undefined)
      throw new Error("This run recorded no HASH process; it cannot resume.");
    const processOf = () => {
      assert(entityUuid, "The run has not opened its process yet");
      return entityUuid;
    };
    return {
      record: {
        brunchOrigin: hashOrigins.brunch,
        frontendOrigin: hashOrigins.frontend,
      },
      environment: {
        ...environment,
        [brunchEnv.chatPort]: new URL(hashOrigins.brunch).port,
        [brunchEnv.apiOrigin]: hashOrigins.api,
        [brunchEnv.hashCorsAllowedOrigins]: hashOrigins.frontend,
      },
      services: [
        {
          script: "dev:brunch:server",
          readyUrl: `${hashOrigins.brunch}/health`,
          recovers: true,
        },
      ],
      buildFilters: ["@apps/brunch-agent^..."],
      open: async (page, { initialNet, name }) => {
        await signIn(page);
        entityUuid = await createProcess(page, {
          // Each run leaves its process behind, named for the run.
          title:
            initialNet === undefined ? name : `${initialNet.title} · ${name}`,
          definition: initialNet?.sdcpn ?? emptyNet,
        });
        const opened = entityUuid;
        await showAssistant(page, () => page.goto(processUrl(opened)));
        return { entityUuid };
      },
      reopen: async (page, session) => {
        assert.equal(
          new URL(session.url).origin,
          new URL(hashOrigins.brunch).origin,
          "session.json names another Brunch",
        );
        // The profile keeps the session cookie; a lapsed one signs in again.
        await page.goto(processUrl(processOf()));
        if (new URL(page.url()).pathname.startsWith("/signin")) {
          await signIn(page);
          await page.goto(processUrl(processOf()));
        }
        // Both refusals come before Brunch starts recovering the turn.
        const saved = await readProcess(page, processOf());
        if (saved === undefined)
          throw new Error(
            `The run's HASH process ${processOf()} no longer exists; it cannot resume.`,
          );
        // The editor opens the saved process, so edits the run left unsaved
        // exist only in the retained live net, which must be current.
        const failedCapture = await readFile(
          join(run, captureFailedFile),
          "utf8",
        ).then(
          (text) => text,
          () => undefined,
        );
        if (failedCapture !== undefined)
          throw new Error(
            `The run's last capture of its live net failed (${captureFailedFile}), so evidence/net.json may be out of date; it cannot resume.`,
          );
        const retainedNet = await readFile(
          join(run, "evidence", "net.json"),
          "utf8",
        ).then(
          (text) => JSON.parse(text) as { title?: unknown; sdcpn?: unknown },
          (error: unknown) => {
            if ((error as NodeJS.ErrnoException).code === "ENOENT")
              throw new Error(
                "The run never captured its live net (evidence/net.json), so unsaved edits cannot be ruled out; it cannot resume.",
              );
            throw error;
          },
        );
        const retained = {
          title: retainedNet.title,
          sdcpn: retainedNet.sdcpn,
        };
        // The launcher's build can leave the frontend recompiling and
        // reloading, and the editor shows the saved process only once it has
        // loaded; until the exported title is the saved one, try again.
        const deadline = Date.now() + settleMs;
        let reopened: { title: unknown; sdcpn: unknown } | undefined;
        let lastExportedTitle: unknown;
        let lastError: unknown;
        while (Date.now() < deadline) {
          const timeout = Math.min(15_000, deadline - Date.now());
          try {
            // eslint-disable-next-line no-await-in-loop -- Each attempt waits on what the page shows next.
            const exported = await exportLiveNet(page, processOf(), timeout);
            lastExportedTitle = exported.title;
            if (exported.title === saved.title) {
              reopened = { title: exported.title, sdcpn: exported.sdcpn };
              break;
            }
          } catch (error) {
            lastError = error;
            // eslint-disable-next-line no-await-in-loop -- As above.
            await page.keyboard.press("Escape").catch(() => {});
          }
        }
        // Only the saved process, once shown, says anything about unsaved edits.
        if (reopened === undefined)
          throw new Error(
            `The HASH editor did not show process ${processOf()} as saved within ${settleMs / 1000}s${
              lastExportedTitle === undefined
                ? ""
                : `; it last exported a net titled ${JSON.stringify(lastExportedTitle)}`
            }`,
            { cause: lastError },
          );
        if (!isDeepStrictEqual(reopened, retained))
          throw new Error(
            `The run's last live net (evidence/net.json) differs from HASH process ${processOf()} as saved, so the run left edits unsaved that reopening cannot restore; it cannot resume.`,
          );
      },
      reload: (page) => showAssistant(page, () => page.reload()),
      capture: async (page, _session, evidenceDirectory) => {
        const entityUuid = processOf();
        const marker = join(run, captureFailedFile);
        try {
          // One page action at a time: the export clicks through the editor.
          const live = await exportLiveNet(page, entityUuid);
          const saved = await readProcess(page, entityUuid);
          assert(saved, `HASH process ${entityUuid} no longer exists`);
          const json = (value: unknown) =>
            `${JSON.stringify(value, null, 2)}\n`;
          await Promise.all([
            writeFile(join(evidenceDirectory, "net.json"), json(live)),
            writeFile(join(evidenceDirectory, "saved-net.json"), json(saved)),
          ]);
        } catch (error) {
          // Resume refuses while this stands: net.json is not the live net.
          await writeFile(
            marker,
            `${JSON.stringify({ failedAt: new Date().toISOString(), error: String(error) }, null, 2)}\n`,
          );
          throw error;
        }
        await rm(marker, { force: true });
        await refreshProofManifest(evidenceDirectory);
      },
      release: async () => {},
    };
  },
});

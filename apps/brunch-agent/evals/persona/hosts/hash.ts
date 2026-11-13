/**
 * Brunch inside the HASH app: the persona talks to the HASH agent in the
 * process editor, signed in as a seeded user. The HASH stack (compose, graph,
 * hash-api, frontend) is shared across the machine and only checked here; the
 * run starts its own Brunch server at the origin the frontend was started
 * with, so one HASH persona run uses the machine at a time.
 */
import { brunchEnv } from "../../../src/env.ts";

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

/** Refuses with what to start when the shared stack is not answering. */
export const checkHashStack = async (signal: AbortSignal) => {
  const missing: string[] = [];
  for (const [name, url] of [
    ["frontend", hashOrigins.frontend],
    ["hash-api", `${hashOrigins.api}/health-check`],
  ] as const) {
    // eslint-disable-next-line no-await-in-loop -- Two probes; order keeps the message stable.
    const answered = await fetch(url, { signal }).then(
      () => true,
      () => false,
    );
    if (!answered) missing.push(name);
  }
  if (missing.length > 0)
    throw new Error(
      `The HASH stack is not answering (${missing.join(", ")}). Start \`yarn compose up\`, \`yarn start:graph\`, \`yarn dev:backend:api\` and \`HASH_BRUNCH_AGENT_ORIGIN=${hashOrigins.brunch} yarn dev:frontend\`.`,
    );
};

/** What the run's Brunch server needs to serve the HASH agent to the frontend. */
export const hashBrunchEnvironment = (
  environment: Record<string, string | undefined>,
): Record<string, string | undefined> => ({
  ...environment,
  [brunchEnv.chatPort]: new URL(hashOrigins.brunch).port,
  [brunchEnv.apiOrigin]: hashOrigins.api,
  [brunchEnv.hashCorsAllowedOrigins]: hashOrigins.frontend,
});

/** Signs the seeded user in through the app's own form. */
export const signInToHash = async (page: Page) => {
  await page.goto(new URL("/signin", hashOrigins.frontend).href);
  await page.fill('[placeholder="Enter your email address"]', seededUser.email);
  await page.fill('[placeholder="Enter your password"]', seededUser.password);
  await page.click("text=Submit");
  await page.waitForURL((url) => !url.pathname.startsWith("/signin"));
};

/**
 * Saves a process as the signed-in user, as the editor's Save does, and
 * returns its entity uuid. Brunch only joins a saved process.
 */
export const createHashProcess = async (
  page: Page,
  { title, definition }: { title: string; definition: unknown },
): Promise<string> => {
  const entityId = await page.evaluate(
    async ({ api, query, variables }) => {
      const response = await fetch(`${api}/graphql`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
      const body = (await response.json()) as {
        data?: {
          createEntity?: { metadata: { recordId: { entityId: string } } };
        };
        errors?: unknown;
      };
      if (!body.data?.createEntity)
        throw new Error(`createEntity failed: ${JSON.stringify(body.errors)}`);
      return body.data.createEntity.metadata.recordId.entityId;
    },
    {
      api: hashOrigins.api,
      query:
        "mutation createEntity($entityTypeIds: [VersionedUrl!]!, $properties: PropertyObjectWithMetadata!) { createEntity(entityTypeIds: $entityTypeIds, properties: $properties) }",
      variables: {
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
    },
  );
  const entityUuid = entityId.split("~")[1];
  if (entityUuid === undefined)
    throw new Error(`Unexpected entity id ${entityId}`);
  return entityUuid;
};

/** Opens the saved process and shows the assistant; nothing is sent. */
export const openHashProcess = async (page: Page, entityUuid: string) => {
  // The panel joins Brunch once its conversation history has loaded.
  const history = page.waitForResponse(
    (response) =>
      response.url().startsWith(hashOrigins.brunch) &&
      new URL(response.url()).searchParams.get("view") === "history",
  );
  await page.goto(
    new URL(`/processes/${entityUuid}`, hashOrigins.frontend).href,
  );
  await history;
  await page
    .getByRole("button", { name: "Show AI assistant", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Message AI assistant", exact: true })
    .waitFor();
};

import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

import { createFlueClient, type AgentSendResult } from "@flue/sdk";

import {
  BRUNCH_CONVERSATION_HEADER,
  BRUNCH_PRINCIPAL_HEADER,
  agentOwnershipHeaders,
} from "../../../conversation/identity.ts";
import { browserSessionOptions } from "../browser-session.ts";

import type { Page } from "@playwright/test";

/** Create through the normal UI and capture only the native attachment fields. */
export const openPersonaConversation = async (
  page: Page,
  origin: string,
  opening: string,
  options: {
    route?: string;
    sessionPath?: string;
    signal?: AbortSignal;
  } = {},
) => {
  await page.goto(
    new URL(options.route ?? "/?brunchTracer=root-creation", origin).href,
  );
  const skipTour = page.getByRole("button", { name: "Skip tour" });
  await skipTour.waitFor();
  await skipTour.click();
  await page
    .getByRole("button", { name: "Show AI assistant", exact: true })
    .click();
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.startsWith("/agents/chat/"),
  );
  const composer = page.getByRole("textbox", {
    name: "Message AI assistant",
    exact: true,
  });
  await composer.fill(opening);
  await composer.press("Enter");
  const response = await responsePromise;
  assert.equal(response.status(), 202, "Browser opening was not admitted");
  const request = response.request();
  const headers = await request.allHeaders();
  const admission = (await response.json()) as AgentSendResult;
  const body: unknown = request.postDataJSON();
  assert(body && typeof body === "object" && "initialData" in body);
  const principalKey = headers[BRUNCH_PRINCIPAL_HEADER];
  const conversationId = headers[BRUNCH_CONVERSATION_HEADER];
  assert(principalKey && conversationId && admission.uid);
  const session = {
    url: request.url(),
    principalKey,
    conversationId,
    initialData: body.initialData,
    uid: admission.uid,
  };
  const client = createFlueClient({
    url: session.url,
    headers: agentOwnershipHeaders(session),
  });
  // Retain the admitted identity even if its response fails; never resend it.
  if (options.sessionPath)
    await writeFile(
      options.sessionPath,
      `${JSON.stringify(session, null, 2)}\n`,
      { mode: 0o600 },
    );
  // Read this admission, never guess which historical assistant entry answered it.
  const reply = await client.read(admission, { signal: options.signal });
  await browserSessionOptions(session);
  return { session, reply, snapshot: await client.history() };
};

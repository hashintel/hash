import assert from "node:assert/strict";

import {
  createFlueClient,
  FlueExecutionError,
  type AgentSendResult,
  type FlueConversationSnapshot,
} from "@flue/sdk";
import {
  errors,
  type Page,
  type Response as BrowserResponse,
} from "@playwright/test";

import {
  agentOwnershipHeaders,
  brunchHeaders,
  brunchRoutes,
} from "@hashintel/brunch-agent";

import type { ConversationIdentity } from "@hashintel/brunch-agent";

/** A failed persona turn that still carries the admitted conversation's history. */
export class PersonaBrowserTurnError extends Error {
  readonly snapshot: FlueConversationSnapshot;
  constructor(
    message: string,
    options: { cause: unknown; snapshot: FlueConversationSnapshot },
  ) {
    super(message, { cause: options.cause });
    this.name = "PersonaBrowserTurnError";
    this.snapshot = options.snapshot;
  }
}

/** `initialData` stays as the browser sent it; resume parses it with `sdcpnInitialDataSchema`. */
export type PersonaBrowserSession = ConversationIdentity & {
  readonly url: string;
  readonly uid: string;
  readonly initialData: unknown;
};

/** A destructive edit the harness allowed, described as the approval panel listed it. */
export interface PersonaAllowedEdit {
  readonly items: readonly string[];
}

/**
 * The persona speaks only through the composer and never sees the approval
 * panel, so an unanswered panel would hold the turn until someone clicked.
 * Allow, not Always allow, keeps one panel and so one record per request.
 */
export const allowDestructiveEdits = async (
  page: Page,
  isSettled: () => boolean,
  onAllowed?: (edit: PersonaAllowedEdit) => Promise<void>,
) => {
  const panel = page
    .getByRole("region", { name: "Approve destructive edits", exact: true })
    .first();
  const allowNext = async () => {
    try {
      await panel.waitFor({ state: "visible", timeout: 1_000 });
    } catch (error) {
      if (error instanceof errors.TimeoutError) return;
      throw error;
    }
    const items = await panel.getByRole("listitem").allTextContents();
    const allow = await panel
      .getByRole("button", { name: "Allow", exact: true })
      .elementHandle();
    assert(allow, "The approval panel has no Allow button");
    try {
      await allow.click();
      // The panel leaves once its call is admitted; wait so it is not counted twice.
      await allow.waitForElementState("hidden");
    } finally {
      await allow.dispose();
    }
    await onAllowed?.({ items });
  };
  while (!isSettled())
    // eslint-disable-next-line no-await-in-loop -- Approvals queue; each panel must leave before the next is read.
    await allowNext();
};

/** Submit text, not tools. Only the ordinary panel executes and continues browser work. */
export const submitPersonaBrowserTurn = async (
  page: Page,
  message: string,
  options: {
    session?: PersonaBrowserSession;
    signal?: AbortSignal;
    onAdmission?: (
      session: PersonaBrowserSession,
      receipt: AgentSendResult,
    ) => Promise<void>;
    onAllowedEdit?: (edit: PersonaAllowedEdit) => Promise<void>;
  } = {},
) => {
  const { signal } = options;
  signal?.throwIfAborted();
  assert(message.trim(), "Persona message must not be empty");
  const composer = page.getByRole("textbox", {
    name: "Message AI assistant",
    exact: true,
  });
  const stop = page.getByRole("button", {
    name: "Stop AI response",
    exact: true,
  });
  assert(!(await stop.isVisible()), "The browser already has an active turn");
  // Whitespace alone is not a draft; `fill` replaces it.
  assert.equal(
    (await composer.inputValue()).trim(),
    "",
    "Refusing to overwrite an existing browser draft",
  );
  // Match the mounted route, including aliases and evaluation candidates.
  // Only the conversation POST admits work; /abort is a control request.
  const admissionPath = new RegExp(`^${brunchRoutes.agents}/[^/]+/[^/]+$`, "u");
  const isAdmission = (response: BrowserResponse) =>
    response.request().method() === "POST" &&
    admissionPath.test(new URL(response.url()).pathname);
  let client: ReturnType<typeof createFlueClient> | undefined;
  let admitted = false;
  let stopTask: Promise<void> | undefined;
  const aborted = Promise.withResolvers<never>();
  // Install rejection handling before a signal can fire during composer submission.
  void aborted.promise.catch(() => {});
  const cancel = () => {
    if (!admitted || stopTask) return;
    stopTask = stop.click({ timeout: 5_000 }).catch(() => {
      // It may have settled or the browser may have closed before Stop was clickable.
    });
    if (signal?.aborted) aborted.reject(signal.reason);
  };
  signal?.addEventListener("abort", cancel, { once: true });
  let turnSettled = false;
  let allowing: Promise<void> | undefined;
  try {
    await composer.fill(message);
    signal?.throwIfAborted();
    const responsePromise = page.waitForResponse(isAdmission);
    await composer.press("Enter");
    admitted = true;
    if (signal?.aborted) cancel();
    const first = await Promise.race([responsePromise, aborted.promise]);
    assert.equal(
      first.status(),
      202,
      "Persona browser submission was not admitted",
    );
    const headers = await first.request().allHeaders();
    const admission = (await first.json()) as AgentSendResult;
    const request: unknown = first.request().postDataJSON();
    assert(
      request &&
        typeof request === "object" &&
        "kind" in request &&
        request.kind === "user",
      "Persona utterance must be a user submission",
    );
    const principalKey = headers[brunchHeaders.principal];
    const conversationId = headers[brunchHeaders.conversation];
    assert(principalKey && conversationId && admission.uid);
    const session: PersonaBrowserSession = {
      url: first.url(),
      principalKey,
      conversationId,
      uid: admission.uid,
      initialData:
        "initialData" in request
          ? request.initialData
          : options.session?.initialData,
    };
    if (options.session) {
      for (const key of [
        "url",
        "principalKey",
        "conversationId",
        "uid",
      ] as const)
        assert.equal(
          session[key],
          options.session[key],
          `Persona browser changed ${key}`,
        );
    }
    client = createFlueClient({
      url: session.url,
      headers: agentOwnershipHeaders(session),
    });
    await options.onAdmission?.(session, admission);
    signal?.throwIfAborted();
    // Submission revokes earlier approvals before its POST. Wait for the
    // receipt and utterance log before watching for this turn's approvals.
    allowing = allowDestructiveEdits(
      page,
      () => turnSettled,
      options.onAllowedEdit,
    );
    // Raced while the turn runs, awaited once it ends.
    void allowing.catch(() => {});
    await Promise.race([
      stop.waitFor({ state: "hidden", timeout: 0 }),
      aborted.promise,
      allowing,
    ]);
    await stopTask;
    // Local Stop hides the busy state before the native abort can settle.
    // read() waits for that settlement; a history snapshot alone can race it.
    const reply = await client
      .read(admission, { signal })
      .catch((error: unknown) => {
        if (error instanceof FlueExecutionError) {
          admitted = false;
          if (error.failure === "aborted")
            throw new DOMException(
              "Persona browser turn was stopped.",
              "AbortError",
            );
        }
        throw error;
      });
    const snapshot = await client.history();
    const submissionIds = [admission.submissionId];
    const settlement = snapshot.settlements.find(
      (item) => item.submissionId === admission.submissionId,
    );
    assert.equal(
      settlement?.outcome,
      "completed",
      "Persona browser turn did not complete",
    );
    signal?.throwIfAborted();
    for (const entry of snapshot.messages.filter(
      (item) =>
        item.submissionId !== undefined &&
        submissionIds.includes(item.submissionId),
    )) {
      for (const part of entry.parts) {
        if (part.type !== "dynamic-tool") continue;
        assert.notEqual(
          part.state,
          "input-available",
          "Incomplete server tool call",
        );
      }
    }
    assert(reply.text.trim(), "Persona turn completed without reply text");
    return { session, reply, snapshot, submissionIds };
  } catch (error) {
    if (admitted) {
      cancel();
      await stopTask;
    }
    // Keep the admitted conversation's history with the failure so a failed
    // run can be diagnosed from what was actually delivered.
    const history = await client?.history().catch(() => undefined);
    if (history !== undefined)
      throw new PersonaBrowserTurnError(
        error instanceof Error ? error.message : String(error),
        { cause: error, snapshot: history },
      );
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancel);
    turnSettled = true;
    await allowing?.catch(() => {});
  }
};

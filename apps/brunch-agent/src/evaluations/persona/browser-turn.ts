/* eslint-disable no-await-in-loop -- Browser continuation quiescence is causal and serial. */
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

import {
  createFlueClient,
  FlueExecutionError,
  type AgentSendResult,
} from "@flue/sdk";

import { clientToolHistoryFrom } from "@hashintel/brunch-agent-transport-aisdk";

import { isAwaitingClient } from "../../conversation/client-tools.ts";
import {
  agentOwnershipHeaders,
  BRUNCH_CONVERSATION_HEADER,
  BRUNCH_PRINCIPAL_HEADER,
} from "../../conversation/identity.ts";

import type { Page, Response as BrowserResponse } from "@playwright/test";

export interface PersonaBrowserSession {
  readonly url: string;
  readonly principalKey: string;
  readonly conversationId: string;
  readonly uid: string;
  readonly initialData: unknown;
}

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
  assert.equal(
    await composer.inputValue(),
    "",
    "Refusing to overwrite an existing browser draft",
  );
  const responses: BrowserResponse[] = [];
  // Only the conversation POST admits work. /abort is a control request,
  // not another conversation or a client-tool continuation.
  const isAdmission = (response: BrowserResponse) =>
    response.request().method() === "POST" &&
    /^\/agents\/chat\/[^/]+$/u.test(new URL(response.url()).pathname);
  let admissionSession: PersonaBrowserSession | undefined;
  const continuationAdmissionTasks: Promise<void>[] = [];
  const collect = (response: BrowserResponse) => {
    if (!isAdmission(response)) return;
    responses.push(response);
    const session = admissionSession;
    if (session === undefined) return;
    continuationAdmissionTasks.push(
      (async () => {
        assert.equal(
          response.url(),
          session.url,
          "Another conversation submitted during the persona turn",
        );
        assert.equal(
          response.status(),
          202,
          "A browser continuation failed admission",
        );
        await options.onAdmission?.(
          session,
          (await response.json()) as AgentSendResult,
        );
      })(),
    );
  };
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
  page.on("response", collect);
  signal?.addEventListener("abort", cancel, { once: true });
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
    const principalKey = headers[BRUNCH_PRINCIPAL_HEADER];
    const conversationId = headers[BRUNCH_CONVERSATION_HEADER];
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
    admissionSession = session;
    await options.onAdmission?.(session, admission);
    if (signal?.aborted) cancel();
    // The product's busy status spans client-tool continuations, unlike one Flue settlement.
    await Promise.race([
      stop.waitFor({ state: "hidden", timeout: 0 }),
      aborted.promise,
    ]);
    // React can briefly hide Stop between the provider response and the effect
    // that starts browser tools or their continuation. Require a short quiet
    // interval with no new admission and no reappearing busy state before
    // treating the complete product turn as settled.
    let observedAdmissions = responses.length;
    let quietIntervals = 0;
    while (quietIntervals < 5) {
      await Promise.race([delay(100), aborted.promise]);
      if (await stop.isVisible()) {
        await Promise.race([
          stop.waitFor({ state: "hidden", timeout: 0 }),
          aborted.promise,
        ]);
        quietIntervals = 0;
        observedAdmissions = responses.length;
      } else if (responses.length !== observedAdmissions) {
        quietIntervals = 0;
        observedAdmissions = responses.length;
      } else {
        quietIntervals += 1;
      }
    }
    await stopTask;
    await Promise.all(continuationAdmissionTasks);
    const admissions = await Promise.all(
      responses.map(async (response) => {
        assert.equal(
          response.url(),
          session.url,
          "Another conversation submitted during the persona turn",
        );
        assert.equal(
          response.status(),
          202,
          "A browser continuation failed admission",
        );
        return (await response.json()) as AgentSendResult;
      }),
    );
    const last = admissions.at(-1);
    assert(last);
    const client = createFlueClient({
      url: session.url,
      headers: agentOwnershipHeaders(session),
    });
    // Local Stop hides the busy state before the native abort can settle.
    // read() waits for that settlement; a history snapshot alone can race it.
    const reply = await client
      .read(last, { signal })
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
    const submissionIds = admissions.map((entry) => entry.submissionId);
    for (const entry of admissions) {
      assert.equal(
        entry.uid,
        session.uid,
        "Runtime incarnation changed during a turn",
      );
      const settlement = snapshot.settlements.find(
        (item) => item.submissionId === entry.submissionId,
      );
      assert.equal(
        settlement?.outcome,
        "completed",
        "Persona browser turn did not complete",
      );
    }
    signal?.throwIfAborted();
    const results = clientToolHistoryFrom(snapshot.messages).results;
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
        if (part.state === "output-available" && isAwaitingClient(part.output))
          assert(
            results.some(
              (result) =>
                result.toolCallId === part.toolCallId &&
                result.toolName === part.toolName,
            ),
            `Unanswered browser call ${part.toolName}`,
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
    throw error;
  } finally {
    page.off("response", collect);
    signal?.removeEventListener("abort", cancel);
  }
};

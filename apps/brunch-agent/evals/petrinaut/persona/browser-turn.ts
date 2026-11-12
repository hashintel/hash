import assert from "node:assert/strict";

import {
  createFlueClient,
  FlueExecutionError,
  type AgentSendResult,
  type FlueConversationSnapshot,
} from "@flue/sdk";
import {
  errors,
  expect,
  type Page,
  type Response as BrowserResponse,
} from "@playwright/test";

import {
  agentOwnershipHeaders,
  brunchHeaders,
  brunchRoutes,
  brunchTools,
  mergeOffers,
  offersAnswers,
  petrinautUserMessageText,
  zOfferAnswersInput,
} from "@hashintel/brunch-agent";

import type {
  ConversationIdentity,
  OfferedQuestion,
} from "@hashintel/brunch-agent";

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

/** `initialData` stays as the browser sent it; resume parses it with `vSdcpnInitialData`. */
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

/**
 * The questions a settled turn docked on the composer: every question its
 * offers named, merged as the panel merges them.
 */
export const offeredQuestionsOf = (
  snapshot: FlueConversationSnapshot,
  submissionIds: readonly string[],
): OfferedQuestion[] => {
  const offer = mergeOffers(
    snapshot.messages
      .filter(
        ({ submissionId }) =>
          submissionId !== undefined && submissionIds.includes(submissionId),
      )
      .flatMap(({ parts }) =>
        parts.flatMap((part) => {
          if (
            part.type !== "dynamic-tool" ||
            part.toolName !== brunchTools.offerAnswers
          )
            return [];
          const parsed = zOfferAnswersInput.safeParse(part.input);
          return parsed.success ? [parsed.data] : [];
        }),
      ),
  );
  return offersAnswers(offer) ? offer.questions : [];
};

/**
 * Give each docked question its answer the way a person would: a click on
 * the option an answer names, typing otherwise, and Send between questions.
 * The last answer is left in the composer for the caller to send.
 */
const fillDockedAnswers = async (page: Page, answers: readonly string[]) => {
  const dock = page.getByRole("region", {
    name: "Brunch's questions",
    exact: true,
  });
  const docked = (await dock.isVisible())
    ? Number(await dock.getAttribute("data-question-count"))
    : 0;
  assert.equal(
    answers.length,
    docked,
    docked === 0
      ? "Brunch has no questions on the message box; reply with `say`."
      : `Brunch has ${docked} question(s) on the message box; give exactly that many answers, "" to skip one.`,
  );
  const composer = page.getByRole("textbox", {
    name: "Message AI assistant",
    exact: true,
  });
  for (const [index, answer] of answers.entries()) {
    const text = answer.trim();
    if (text) {
      const option = dock
        .getByRole("group")
        .getByRole("button", { name: text, exact: true });
      // eslint-disable-next-line no-await-in-loop -- The dock shows one question at a time.
      if ((await option.count()) === 1) {
        // eslint-disable-next-line no-await-in-loop -- As above.
        await option.click();
        // A pick that wrote nothing would send an unanswered question.
        // eslint-disable-next-line no-await-in-loop -- As above.
        await expect(
          composer,
          `Picking "${text}" wrote no answer into the composer`,
        ).not.toHaveValue("", { timeout: 5_000 });
      }
      // eslint-disable-next-line no-await-in-loop -- As above.
      else await composer.fill(text);
    }
    if (index < answers.length - 1)
      // Send moves on once there is an answer; the arrow skips without one.
      // eslint-disable-next-line no-await-in-loop -- As above.
      await page
        .getByRole("button", {
          name: text ? "Continue to next question" : "Next question",
          exact: true,
        })
        .click();
  }
};

/**
 * Submit text, not tools. Only the ordinary panel executes and continues
 * browser work. `utterance` is one typed message, or one answer for each
 * question docked on the composer.
 */
export const submitPersonaBrowserTurn = async (
  page: Page,
  utterance: string | readonly string[],
  options: {
    session?: PersonaBrowserSession;
    signal?: AbortSignal;
    /** `sent` is the text Brunch received. */
    onAdmission?: (
      session: PersonaBrowserSession,
      receipt: AgentSendResult,
      sent: string,
    ) => Promise<void>;
    onAllowedEdit?: (edit: PersonaAllowedEdit) => Promise<void>;
  } = {},
) => {
  const { signal } = options;
  signal?.throwIfAborted();
  const typed = typeof utterance === "string" ? utterance : undefined;
  assert(
    (typeof utterance === "string" ? [utterance] : utterance).some((text) =>
      text.trim(),
    ),
    "Persona message must not be empty",
  );
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
    if (typeof utterance !== "string") await fillDockedAnswers(page, utterance);
    else {
      // With several questions docked, Send would only move to the next one.
      const steps = page.getByRole("button", {
        name: "Next question",
        exact: true,
      });
      assert(
        !(await steps.isVisible()),
        "Brunch has several questions on the message box; answer them together with `answer`.",
      );
      await composer.fill(utterance);
    }
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
    // The website names the actor under the header's former name until it
    // sends the actor header from its own server-side hop.
    const actorKey =
      headers[brunchHeaders.actor] ?? headers[brunchHeaders.legacyPrincipal];
    const conversationId = headers[brunchHeaders.conversation];
    assert(actorKey && conversationId && admission.uid);
    const session: PersonaBrowserSession = {
      url: first.url(),
      actorKey,
      conversationId,
      uid: admission.uid,
      initialData:
        "initialData" in request
          ? request.initialData
          : options.session?.initialData,
    };
    if (options.session) {
      for (const key of ["url", "actorKey", "conversationId", "uid"] as const)
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
    const body =
      "body" in request && typeof request.body === "string"
        ? petrinautUserMessageText(request.body)
        : undefined;
    assert(
      typed !== undefined || body,
      "Could not read the answers Brunch received",
    );
    await options.onAdmission?.(session, admission, typed ?? body ?? "");
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

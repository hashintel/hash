/**
 * Manual witness for the Ledger tab and experiment timing: the built
 * website's Brunch panel in real Chrome against the built Brunch app, with
 * scripted OpenAI responses only. Each case reports PASS, FAIL or a measured duration, and
 * every case runs even when an earlier one fails. Name cases as arguments
 * (`ledger-tab.ts ledgerReviewControls`) to run only those; the final line
 * then names the subset rather than claiming the whole witness.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  type AssistantMessage,
  fauxAssistantMessage,
  fauxText,
  type JsonObject,
} from "@earendil-works/pi-ai";
import { type Page } from "@playwright/test";

import { netCalls } from "../../src/shared/conversation/net-changes.ts";
import { loadBuiltBrunchApplication } from "../load-built-application.ts";
import {
  installFauxOpenai,
  openaiCallId,
  openBrowserFixture,
  prepareWitnessProcess,
  toolCall,
} from "./browser-fixture.ts";

import type { SDCPN } from "@hashintel/petrinaut-core";

const output = prepareWitnessProcess("browser-witness-ledger-tab");
const faux = installFauxOpenai();

const app = await loadBuiltBrunchApplication();
const fixture = await openBrowserFixture(app);

/** The final net of persona run run-0cuMkw (service-reservoir-overflow, manual arm). */
const hillcrestNet = JSON.parse(
  readFileSync(new URL("fixtures/hillcrest-net.json", import.meta.url), "utf8"),
) as SDCPN;
const savedDocument = (id: string, sdcpn: SDCPN) => ({
  [id]: {
    id,
    incarnationId: `${id}-incarnation`,
    revisionId: `${id}-revision`,
    title: "Hillcrest",
    lastUpdated: "2020-01-01T00:00:00.000Z",
    sdcpn,
  },
});

/** Asks Brunch to record the reservoir and its overflow claim, and checks the commit was recorded. */
const recordReservoir = async (page: Page) => {
  faux.setResponses([
    toolCall(
      "ledger_commit",
      {
        entries: [
          [
            "entity/create",
            {
              name: "Hillcrest service reservoir",
              kind: "resource",
              origin: "stated",
              status: "confirmed",
            },
          ],
          [
            "claim/create",
            {
              text: "Hillcrest overflowed three times this summer.",
              entities: ["$0"],
              origin: "stated",
              status: "confirmed",
            },
          ],
        ],
      },
      "commit-1",
    ),
    fauxAssistantMessage([fauxText("Recorded the reservoir.")]),
  ]);
  const delivery = await fixture.ask(
    page,
    "Hillcrest service reservoir overflowed three times this summer.",
    "Recorded the reservoir.",
    60_000,
  );
  const { client } = await fixture.conversationOf(page, delivery);
  const committed = (await client.history()).messages
    .flatMap((message) => message.parts)
    .find(
      (part) =>
        part.type === "dynamic-tool" && part.toolName === "ledger_commit",
    );
  assert.equal(
    (committed as { output?: { status?: string } } | undefined)?.output?.status,
    "recorded",
    "the commit itself must be recorded",
  );
};

/**
 * Each record occurrence the Ledger marks as changed by the latest turn, in
 * document order: address, change, and the marker word its style shows.
 */
const latestTurnMarks = (page: Page) =>
  page
    .locator('section[aria-label="Ledger"] [data-ledger-change]')
    .evaluateAll((elements) =>
      elements.map((element) =>
        [
          element.getAttribute("data-ledger-address"),
          element.getAttribute("data-ledger-change"),
          getComputedStyle(element, "::before").content,
        ].join(" "),
      ),
    );

/** Polls the marks until they equal `expected`; returns the last observed either way. */
const marksSettleOn = async (
  page: Page,
  expected: string[],
  deadline = Date.now() + 15_000,
): Promise<string[]> => {
  const marks = await latestTurnMarks(page);
  if (
    JSON.stringify(marks) === JSON.stringify(expected) ||
    Date.now() >= deadline
  )
    return marks;
  await new Promise((resolve) => setTimeout(resolve, 100));
  return marksSettleOn(page, expected, deadline);
};

/** A recorded Ledger commit reaches the panel's Ledger tab. */
const ledgerTabShowsCommit = async () => {
  const page = await fixture.openAssistant();
  await recordReservoir(page);
  await page.getByRole("tab", { name: "Ledger" }).click();
  await page
    .getByText("Hillcrest service reservoir", { exact: true })
    .first()
    .waitFor({ timeout: 10_000 });
};

/**
 * The Ledger is a review surface: Chat owns the message composer and Voice
 * launch, while the Ledger keeps Stop for running work and its explicit
 * comment controls, and switching tabs keeps the draft. Observations print
 * before the assertions, so a failing run still records what the panel showed.
 */
const ledgerReviewControls = async () => {
  const page = await fixture.openAssistant();
  page.setDefaultTimeout(15_000);
  const chatTab = page.getByRole("tab", { name: "Chat" });
  const ledgerTab = page.getByRole("tab", { name: "Ledger" });
  const composer = page.getByRole("textbox", {
    name: "Message AI assistant",
    exact: true,
  });
  const stop = page.getByRole("button", {
    name: "Stop AI response",
    exact: true,
  });
  const voiceLaunch = page.getByRole("button", {
    name: "Start voice mode",
    exact: true,
  });
  const visibleCount = async (locator: ReturnType<Page["getByRole"]>) => {
    let visible = 0;
    for (const element of await locator.all())
      if (await element.isVisible()) visible += 1;
    return visible;
  };
  const controls = async () => ({
    composer: await visibleCount(composer),
    stop: await visibleCount(stop),
    voiceLaunch: await visibleCount(voiceLaunch),
  });
  // The Ledger's footer row, which holds host controls and Stop.
  const reviewFooter = page.locator("div[data-review]:has(> form)");
  const observed: Record<string, unknown> = {};
  try {
    await recordReservoir(page);
    observed.chatIdle = await controls();

    // A running turn, held open until Stop aborts it or the case releases it.
    let release: (() => void) | undefined;
    let providerAborted = false;
    faux.setResponses([
      (_context, options) =>
        new Promise<AssistantMessage>((resolve) => {
          const finish = () =>
            resolve(fauxAssistantMessage([fauxText("Held reply finished.")]));
          release = finish;
          options?.signal?.addEventListener("abort", () => {
            providerAborted = true;
            finish();
          });
          setTimeout(finish, 60_000).unref();
        }),
    ]);
    await fixture.send(page, "Look at the reservoir again.");
    await stop.waitFor();
    observed.chatBusy = await controls();
    await ledgerTab.click();
    await page
      .getByText("Hillcrest service reservoir", { exact: true })
      .first()
      .waitFor();
    observed.ledgerBusy = await controls();
    await page.screenshot({ path: join(output, "ledger-busy.png") });
    observed.ledgerBusyTabSelected =
      await ledgerTab.getAttribute("aria-selected");
    const ledgerStopVisible = (await visibleCount(stop)) === 1;
    if (ledgerStopVisible) {
      await stop.click();
      await stop.waitFor({ state: "hidden" });
    }
    observed.ledgerStopped = {
      ...(await controls()),
      providerAborted,
      stillOnLedger: await ledgerTab.getAttribute("aria-selected"),
    };
    release?.();

    // A turn that changes the Ledger, so the comment turn below has marks to clear.
    await chatTab.click();
    faux.setResponses([
      toolCall(
        "ledger_commit",
        {
          entries: [
            [
              "entity/create",
              {
                name: "Booster pump",
                kind: "resource",
                origin: "stated",
                status: "confirmed",
              },
            ],
          ],
        },
        "commit-pump",
      ),
      fauxAssistantMessage([fauxText("Recorded the pump.")]),
    ]);
    await fixture.ask(
      page,
      "A booster pump fills it.",
      "Recorded the pump.",
      60_000,
    );

    // An unsent draft survives Chat → Ledger → Chat.
    await composer.fill("Unsent draft about pumps");
    await ledgerTab.click();
    observed.marksBeforeComment = await marksSettleOn(page, ['e2 added "New"']);
    observed.ledgerIdleWithDraft = {
      ...(await controls()),
      // With no comments, hint or running work, the review tab has no footer.
      emptyFooterVisible: await reviewFooter.isVisible(),
    };

    // An explicit Ledger comment, sent from the Ledger's own control.
    await page.evaluate(() => {
      const ledger = document.querySelector('section[aria-label="Ledger"]');
      if (!ledger) throw new Error("No Ledger section");
      const walker = document.createTreeWalker(ledger, NodeFilter.SHOW_TEXT);
      let claim: Node | null = walker.nextNode();
      while (claim && !claim.textContent?.includes("overflowed three times"))
        claim = walker.nextNode();
      if (!claim)
        throw new Error(
          `No overflow claim on the Ledger: ${ledger.textContent}`,
        );
      const range = document.createRange();
      range.selectNodeContents(claim);
      const selection = document.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    const form = page.getByRole("dialog", { name: "Comment on the Ledger" });
    await form
      .getByRole("textbox", { name: "Comment" })
      .fill("Was that three separate nights?");
    await form.getByRole("button", { name: "Add comment" }).click();
    const commentsBar = page.getByRole("group", { name: "Ledger comments" });
    await commentsBar.waitFor();
    observed.commentsBar = await commentsBar.textContent();
    observed.commentsFooterVisible = await reviewFooter.isVisible();
    await page.screenshot({ path: join(output, "ledger-comments.png") });
    const commentReply = "Noted your comment on the overflow claim.";
    faux.setResponses([fauxAssistantMessage([fauxText(commentReply)])]);
    await commentsBar.getByRole("button", { name: "Send" }).click();
    await commentsBar.waitFor({ state: "hidden", timeout: 30_000 });
    observed.afterCommentSend = {
      ...(await controls()),
      stillOnLedger: await ledgerTab.getAttribute("aria-selected"),
    };
    // The comment batch opens a turn that commits nothing, so once Brunch
    // has replied to it the Ledger marks nothing.
    await page
      .getByText(commentReply, { exact: true })
      .waitFor({ state: "attached" });
    observed.marksAfterCommentTurn = await marksSettleOn(page, []);
    observed.recordsAfterCommentTurn = await page
      .locator('section[aria-label="Ledger"] [data-ledger-address]')
      .count();

    await chatTab.click();
    await page.getByText(commentReply, { exact: true }).waitFor();
    observed.chatAfterComment = {
      ...(await controls()),
      draft: await composer.inputValue(),
    };
    // Keyboard: arrow keys move between the tabs and select them.
    await chatTab.focus();
    await page.keyboard.press("ArrowRight");
    observed.keyboard = {
      ledgerSelected: await ledgerTab.getAttribute("aria-selected"),
      ledgerFocused: await ledgerTab.evaluate(
        (element) => element === document.activeElement,
      ),
      ...(await controls()),
    };
    await page.keyboard.press("ArrowLeft");
    observed.keyboardBack = {
      chatSelected: await chatTab.getAttribute("aria-selected"),
      draft: await composer.inputValue(),
    };
  } finally {
    process.stdout.write(`OBSERVED ${JSON.stringify(observed)}\n`);
    await page.close();
  }

  assert.deepEqual(observed.chatIdle, { composer: 1, stop: 0, voiceLaunch: 0 });
  assert.deepEqual(observed.chatBusy, { composer: 1, stop: 1, voiceLaunch: 0 });
  assert.deepEqual(observed.ledgerBusy, {
    composer: 0,
    stop: 1,
    voiceLaunch: 0,
  });
  assert.equal(observed.ledgerBusyTabSelected, "true");
  assert.deepEqual(observed.ledgerStopped, {
    composer: 0,
    stop: 0,
    voiceLaunch: 0,
    providerAborted: true,
    stillOnLedger: "true",
  });
  assert.deepEqual(observed.ledgerIdleWithDraft, {
    composer: 0,
    stop: 0,
    voiceLaunch: 0,
    emptyFooterVisible: false,
  });
  assert.deepEqual(observed.marksBeforeComment, ['e2 added "New"']);
  assert.deepEqual(observed.marksAfterCommentTurn, []);
  assert.notEqual(observed.recordsAfterCommentTurn, 0);
  assert.match(String(observed.commentsBar), /1 comment on the Ledger/u);
  assert.equal(observed.commentsFooterVisible, true);
  assert.deepEqual(observed.afterCommentSend, {
    composer: 0,
    stop: 0,
    voiceLaunch: 0,
    stillOnLedger: "true",
  });
  assert.deepEqual(observed.chatAfterComment, {
    composer: 1,
    stop: 0,
    voiceLaunch: 0,
    draft: "Unsent draft about pumps",
  });
  assert.deepEqual(observed.keyboard, {
    ledgerSelected: "true",
    ledgerFocused: true,
    composer: 0,
    stop: 0,
    voiceLaunch: 0,
  });
  assert.deepEqual(observed.keyboardBack, {
    chatSelected: "true",
    draft: "Unsent draft about pumps",
  });
};

/** A provider response held until the case releases it, so the turn keeps running. */
const heldResponse = (message: AssistantMessage) => {
  let release: () => void = () => {};
  const respond = () =>
    new Promise<AssistantMessage>((resolve) => {
      release = () => resolve(message);
      setTimeout(release, 60_000).unref();
    });
  return { respond, release: () => release() };
};

/**
 * Waits until no finite animation or transition runs, such as the tab pill's,
 * and reports the selected tab with its box, so a screenshot shows settled tabs.
 */
const tabsSettled = async (page: Page) => {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== "running" ||
          animation.effect?.getTiming().iterations === Infinity,
      ),
  );
  return page
    .locator('[data-style-variant="pill"] [role="tab"][aria-selected="true"]')
    .evaluate((tab) => {
      const box = tab.getBoundingClientRect();
      return {
        selected: tab.textContent,
        pill: getComputedStyle(tab).backgroundColor,
        box: [box.x, box.y, box.width, box.height].map(Math.round),
      };
    });
};

/**
 * The Ledger marks the entries the latest turn added or changed: across its
 * accepted commits while the response runs, not a refused call, the same after
 * tab switches and a reload, and none once a turn changes nothing. Marker
 * words stay out of a comment's quote. Observations print before the
 * assertions, so a failing run still records what the Ledger showed.
 */
const ledgerLatestTurnHighlights = async () => {
  const page = await fixture.openAssistant();
  page.setDefaultTimeout(15_000);
  const chatTab = () => page.getByRole("tab", { name: "Chat" });
  const ledgerTab = () => page.getByRole("tab", { name: "Ledger" });
  const stop = () =>
    page.getByRole("button", { name: "Stop AI response", exact: true });
  const observed: Record<string, unknown> = {};
  const turnTwoRunning = ['c2 updated "Updated"', 'e2 added "New"'];
  const turnTwoDone = [
    'e2 added "New"',
    'e1 updated "Updated"',
    'c2 updated "Updated"',
  ];
  try {
    await recordReservoir(page);
    await ledgerTab().click();
    observed.turnOne = await marksSettleOn(page, [
      'e1 added "New"',
      'c1 added "New"',
    ]);
    await chatTab().click();

    // Turn two replaces the overflow claim and adds a pump, has a call
    // refused, then holds its response open before moving the reservoir out
    // of scope.
    const held = heldResponse(
      toolCall(
        "ledger_commit",
        {
          entries: [
            [
              "entity/update/e1",
              {
                name: "Hillcrest service reservoir",
                kind: "resource",
                origin: "stated",
                status: "out-of-scope",
              },
            ],
          ],
        },
        "commit-4",
      ),
    );
    faux.setResponses([
      toolCall(
        "ledger_commit",
        {
          entries: [
            [
              "claim/create",
              {
                text: "Hillcrest overflowed four times this summer.",
                entities: ["e1"],
                origin: "stated",
                status: "confirmed",
                supersedes: ["c1"],
              },
            ],
            [
              "entity/create",
              {
                name: "Booster pump",
                kind: "resource",
                origin: "stated",
                status: "confirmed",
              },
            ],
          ],
        },
        "commit-2",
      ),
      toolCall(
        "ledger_commit",
        {
          entries: [
            [
              "entity/update/e9",
              {
                name: "Nowhere",
                kind: "resource",
                origin: "stated",
                status: "confirmed",
              },
            ],
          ],
        },
        "commit-3",
      ),
      held.respond,
      fauxAssistantMessage([fauxText("Moved the reservoir out of scope.")]),
    ]);
    await fixture.send(
      page,
      "It overflowed four times; a booster pump fills it.",
    );
    await stop().waitFor();
    await ledgerTab().click();
    observed.turnTwoRunning = await marksSettleOn(page, turnTwoRunning);
    observed.turnTwoRunningStop = await stop().isVisible();
    observed.turnTwoRunningTabs = await tabsSettled(page);
    await page.screenshot({
      path: join(output, "ledger-latest-turn-running.png"),
    });
    await chatTab().click();
    await ledgerTab().click();
    observed.turnTwoRunningAfterTabs = await latestTurnMarks(page);

    held.release();
    await page
      .getByText("Moved the reservoir out of scope.", { exact: true })
      .waitFor({ state: "attached" });
    observed.turnTwoDone = await marksSettleOn(page, turnTwoDone);
    // The superseded claim stays as context under its replacement, unmarked.
    observed.supersededMark = await page
      .locator('section[aria-label="Ledger"] [data-ledger-address="c1"]')
      .evaluateAll((elements) =>
        elements.map(
          (element) =>
            `${element.textContent} ${element.getAttribute("data-ledger-change")}`,
        ),
      );
    observed.markedEntryAria = await page
      .locator(
        'section[aria-label="Ledger"] li:has(> [data-ledger-address="e2"])',
      )
      .ariaSnapshot();
    observed.turnTwoDoneTabs = await tabsSettled(page);
    await page.screenshot({
      path: join(output, "ledger-latest-turn-done.png"),
    });

    // A comment's quote carries the record's words, not its marker.
    await page
      .locator('section[aria-label="Ledger"] [data-ledger-address="e2"]')
      .first()
      .evaluate((record) => {
        const range = document.createRange();
        range.selectNodeContents(record);
        const selection = document.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      });
    observed.selectedText = await page.evaluate(() =>
      document.getSelection()?.toString(),
    );
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    const form = page.getByRole("dialog", { name: "Comment on the Ledger" });
    observed.commentQuote = await form.locator("blockquote").textContent();
    await form.getByRole("button", { name: "Cancel" }).click();

    // The same history after a reload marks the same entries. The fixture
    // serves files only, so the document's route gets the site's index page
    // as a deployed host's fallback would.
    await page.route(
      (url) => url.pathname.startsWith("/local/"),
      async (route) =>
        route.fulfill({
          response: await route.fetch({ url: `${fixture.origin}/` }),
        }),
    );
    await page.reload();
    const skipTour = page.getByRole("button", { name: "Skip tour" });
    if (await skipTour.isVisible().catch(() => false)) await skipTour.click();
    const showAssistant = page.getByRole("button", {
      name: "Show AI assistant",
      exact: true,
    });
    await ledgerTab().or(showAssistant).first().waitFor();
    if (await showAssistant.isVisible()) await showAssistant.click();
    await ledgerTab().click();
    observed.afterReload = await marksSettleOn(page, turnTwoDone);

    // Turn three clears the marks as it opens and changes nothing.
    await chatTab().click();
    const quiet = heldResponse(
      fauxAssistantMessage([fauxText("Glad to help.")]),
    );
    faux.setResponses([quiet.respond]);
    await fixture.send(page, "Thanks, that is all for now.");
    await stop().waitFor();
    await ledgerTab().click();
    observed.turnThreeRunning = await marksSettleOn(page, []);
    observed.turnThreeRecords = await page
      .locator('section[aria-label="Ledger"] [data-ledger-address]')
      .evaluateAll((elements) => [
        ...new Set(
          elements.map((element) =>
            element.getAttribute("data-ledger-address"),
          ),
        ),
      ]);
    observed.turnThreeRunningTabs = await tabsSettled(page);
    await page.screenshot({
      path: join(output, "ledger-latest-turn-cleared.png"),
    });
    quiet.release();
    await stop().waitFor({ state: "hidden" });
    observed.turnThreeDone = await latestTurnMarks(page);
  } finally {
    process.stdout.write(`OBSERVED ${JSON.stringify(observed)}\n`);
    await page.close();
  }

  assert.deepEqual(observed.turnOne, ['e1 added "New"', 'c1 added "New"']);
  assert.deepEqual(observed.turnTwoRunning, turnTwoRunning);
  assert.equal(observed.turnTwoRunningStop, true);
  assert.deepEqual(observed.turnTwoRunningAfterTabs, turnTwoRunning);
  assert.deepEqual(observed.turnTwoDone, turnTwoDone);
  assert.deepEqual(observed.supersededMark, [
    "Hillcrest overflowed three times this summer. — superseded null",
  ]);
  assert.deepEqual(observed.afterReload, turnTwoDone);
  // The marker word reaches the accessibility tree, ahead of the record.
  assert.equal(
    observed.markedEntryAria,
    "- listitem:\n  - text: New\n  - strong: Booster pump\n  - text: — stated · confirmed",
  );
  assert.equal(observed.selectedText, "Booster pump — stated · confirmed");
  assert.equal(observed.commentQuote, "“Booster pump — stated · confirmed”");
  assert.deepEqual(observed.turnThreeRunning, []);
  assert.deepEqual(observed.turnThreeRecords, ["e2", "e1", "c2", "c1"]);
  assert.deepEqual(observed.turnThreeDone, []);
};

/** Submission intent clears old marks before admission, and refusal does not restore them. */
const ledgerSubmissionClearsHighlights = async () => {
  const page = await fixture.openAssistant();
  const observed: Record<string, unknown> = {};
  let release = () => {};
  const admissionGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let holdNext = true;
  let refuseNext = false;
  try {
    await recordReservoir(page);
    const ledgerTab = page.getByRole("tab", { name: "Ledger" });
    const chatTab = page.getByRole("tab", { name: "Chat" });
    const composer = page.getByRole("textbox", {
      name: "Message AI assistant",
      exact: true,
    });
    const stop = page.getByRole("button", {
      name: "Stop AI response",
      exact: true,
    });
    await ledgerTab.click();
    observed.beforeSubmission = await marksSettleOn(page, [
      'e1 added "New"',
      'c1 added "New"',
    ]);
    assert.deepEqual(observed.beforeSubmission, [
      'e1 added "New"',
      'c1 added "New"',
    ]);
    await page.route("**/agents/**", async (route) => {
      if (route.request().method() === "POST") {
        if (holdNext) {
          holdNext = false;
          await admissionGate;
        } else if (refuseNext) {
          refuseNext = false;
          await route.fulfill({
            status: 403,
            contentType: "application/json",
            body: JSON.stringify({ error: "Witness admission refused" }),
          });
          return;
        }
      }
      await route.fallback();
    });
    faux.setResponses([
      toolCall(
        "ledger_commit",
        {
          entries: [
            [
              "entity/create",
              {
                name: "Booster pump",
                kind: "resource",
                origin: "stated",
                status: "confirmed",
              },
            ],
          ],
        },
        "intent-pump",
      ),
      fauxAssistantMessage([fauxText("Recorded the pump after admission.")]),
    ]);
    await chatTab.click();
    await composer.fill("A booster pump fills it.");
    const submitted = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname.startsWith("/agents/"),
      { timeout: 10_000 },
    );
    await composer.press("Enter");
    await submitted;
    await ledgerTab.click();
    observed.pendingAdmission = await latestTurnMarks(page);
    observed.pendingStopVisible = await stop.isVisible();
    assert.deepEqual(observed.pendingAdmission, []);
    assert.equal(observed.pendingStopVisible, true);
    release();
    await chatTab.click();
    await page
      .getByText("Recorded the pump after admission.", { exact: true })
      .waitFor();
    await ledgerTab.click();
    observed.afterAdmission = await marksSettleOn(page, ['e2 added "New"']);
    assert.deepEqual(observed.afterAdmission, ['e2 added "New"']);

    // Refusal leaves the canonical turn unchanged, but does not undo the user's intent.
    refuseNext = true;
    await chatTab.click();
    await composer.fill("A submission the server will refuse.");
    const refused = page.waitForResponse(
      (response) =>
        response.status() === 403 &&
        new URL(response.url()).pathname.startsWith("/agents/"),
      { timeout: 10_000 },
    );
    await composer.press("Enter");
    await refused;
    await stop.waitFor({ state: "hidden" });
    await ledgerTab.click();
    observed.afterRefusal = await latestTurnMarks(page);
    observed.recordsAfterRefusal = await page
      .locator('section[aria-label="Ledger"] [data-ledger-address]')
      .count();
    assert.deepEqual(observed.afterRefusal, []);
    assert.equal(observed.recordsAfterRefusal, 3);
    await chatTab.click();
    await ledgerTab.click();
    assert.deepEqual(await latestTurnMarks(page), []);
  } finally {
    release();
    process.stdout.write(
      `OBSERVED ledgerSubmissionClearsHighlights ${JSON.stringify(observed)}\n`,
    );
    await page.close();
  }
};

const baseRequest = {
  scenarioId: "summer_nights_levers",
  runCount: 1,
  seed: 20261008,
  maxTime: 720,
  metricIds: [
    "overflow_event_count",
    "fire_reserve_breach_count",
    "low_morning_event_count",
    "reservoir_level_m",
    "pump_running",
  ],
};
const fixedValues = {
  cut_out_level_m: { mode: "fixed", value: 5.4 },
  enable_vsd: { mode: "fixed", value: 1 },
  vsd_margin_lps: { mode: "fixed", value: 7.5 },
  initial_level_m: { mode: "fixed", value: 5 },
  start_hour: { mode: "fixed", value: 0 },
  night_demand_lps: { mode: "fixed", value: 20 },
  morning_peak_demand_lps: { mode: "fixed", value: 80 },
};

/** Times one direct createExperiment on the Hillcrest net; undefined when it outlasts the cap. */
const timeExperiment = async (
  label: string,
  experiment: JsonObject,
  capMs: number,
) => {
  const page = await fixture.openAssistant(
    "/",
    savedDocument(label, hillcrestNet),
  );
  const reply = `${label} finished.`;
  faux.setResponses([
    toolCall("getLatestNetDefinition", {}, `${label}-read`),
    toolCall("createExperiment", experiment, `${label}-run`),
    fauxAssistantMessage([fauxText(reply)]),
  ]);
  const started = performance.now();
  try {
    const delivery = await fixture.ask(
      page,
      `Run the ${label} experiment.`,
      reply,
      capMs,
    );
    const elapsed = performance.now() - started;
    const { client } = await fixture.conversationOf(page, delivery);
    const result = netCalls(await client.history()).find(
      ({ toolCallId }) => toolCallId === openaiCallId(`${label}-run`),
    );
    return {
      elapsedMs: Math.round(elapsed),
      status: (result?.output as { status?: string } | undefined)?.status,
    };
  } catch {
    return { elapsedMs: undefined, status: `exceeded ${capMs / 1000} s` };
  } finally {
    await page.close();
  }
};

const experimentTimings = async () => {
  const cases: { label: string; experiment: JsonObject }[] = [
    {
      label: "simulate-dt1",
      experiment: {
        ...baseRequest,
        name: "Fixed VSD setting, minute steps",
        scenarioParameterValues: fixedValues,
        dt: 1,
        execution: { mode: "simulate" },
      },
    },
    {
      label: "simulate-dt001",
      experiment: {
        ...baseRequest,
        name: "Fixed VSD setting, run-0cuMkw resolution",
        scenarioParameterValues: fixedValues,
        dt: 0.01,
        execution: { mode: "simulate" },
      },
    },
    {
      label: "optimize-run-0cuMkw",
      experiment: {
        ...baseRequest,
        name: "VSD margin sweep over 30 summer nights",
        scenarioParameterValues: {
          ...fixedValues,
          vsd_margin_lps: { mode: "range", min: 5, max: 10 },
        },
        dt: 0.01,
        execution: {
          mode: "optimize",
          objectiveMetricId: "overflow_event_count",
          direction: "minimize",
          steps: 6,
          runsPerStep: 1,
        },
      },
    },
  ];
  for (const { label, experiment } of cases) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- The cases share one scripted response queue.
    const timing = await timeExperiment(label, experiment, 180_000);
    process.stdout.write(
      `TIMING ${label}: ${timing.elapsedMs ?? "-"} ms, ${timing.status}\n`,
    );
  }
};

const witnesses = [
  ledgerTabShowsCommit,
  ledgerReviewControls,
  ledgerLatestTurnHighlights,
  ledgerSubmissionClearsHighlights,
  experimentTimings,
];
const selected = process.argv.slice(2);
const unknown = selected.filter(
  (name) => !witnesses.some((witness) => witness.name === name),
);
assert.deepEqual(unknown, [], "Unknown witness case");
const failures: string[] = [];
try {
  for (const witness of selected.length === 0
    ? witnesses
    : witnesses.filter(({ name }) => selected.includes(name))) {
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- The cases share one scripted response queue.
      await witness();
      process.stdout.write(`PASS ${witness.name}\n`);
    } catch (error) {
      failures.push(witness.name);
      process.stdout.write(`FAIL ${witness.name}: ${String(error)}\n`);
    }
  }
  process.stdout.write(
    `${JSON.stringify({ errors: fixture.errors, blocked: fixture.blocked })}\n`,
  );
  process.stdout.write(`OUTPUT ${output}\n`);
  assert.deepEqual(failures, []);
  process.stdout.write(
    selected.length === 0
      ? "BROWSER_WITNESS_MANUAL_PASS\n"
      : `BROWSER_WITNESS_SELECTED_PASS ${selected.join(" ")}\n`,
  );
} finally {
  try {
    await fixture.close();
  } finally {
    await app.stop();
  }
}

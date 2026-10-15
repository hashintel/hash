/**
 * Real-browser regression witness for the persona helper. Build the website
 * with either /agents/petrinaut or /agents/chat as VITE_BRUNCH_CHAT_ENDPOINT.
 * Uses the built app, local Chrome and synthetic OpenAI only; no paid calls.
 */
import assert from "node:assert/strict";

import { fauxAssistantMessage, fauxText } from "@earendil-works/pi-ai";

import { toPetrinautId, type SDCPN } from "@hashintel/petrinaut-core";

import {
  submitPersonaBrowserTurn,
  type PersonaAllowedEdit,
} from "../../evals/petrinaut/persona/browser-turn.ts";
import {
  isAppliedChange,
  netCalls,
} from "../../src/shared/conversation/net-changes.ts";
import { loadBuiltBrunchApplication } from "../load-built-application.ts";
import {
  installFauxOpenai,
  openaiCallId,
  openBrowserFixture,
  prepareWitnessProcess,
  toolCall,
} from "./browser-fixture.ts";

prepareWitnessProcess("persona-turn-witness");
const faux = installFauxOpenai();
const app = await loadBuiltBrunchApplication();
const fixture = await openBrowserFixture(app);

const documentId = toPetrinautId("persona-approval-net");
const net: SDCPN = {
  places: ["Victim", "Keeper"].map((name, index) => ({
    id: name.toLowerCase(),
    name,
    colorId: null,
    dynamicsEnabled: false,
    differentialEquationId: null,
    x: index * 200,
    y: 0,
  })),
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};
const openNet = () =>
  fixture.openAssistant("/", {
    [documentId]: {
      id: documentId,
      revisionId: "initial-revision",
      title: "Persona approval witness",
      lastUpdated: "2020-01-01T00:00:00.000Z",
      sdcpn: net,
    },
  });

/** The actual configured route must admit both the opening and a later utterance. */
const personaAdmission = async () => {
  const page = await fixture.openAssistant();
  page.setDefaultTimeout(5_000);
  const answer = "Persona admission completed.";
  faux.setResponses([
    fauxAssistantMessage([fauxText(answer)]),
    fauxAssistantMessage([fauxText(answer)]),
  ]);
  const first = await submitPersonaBrowserTurn(page, "Say hello.");
  const next = await submitPersonaBrowserTurn(page, "Say hello again.", {
    session: first.session,
  });
  assert.equal(first.reply.text, answer);
  assert.equal(next.reply.text, answer);
  assert.equal(next.session.url, first.session.url);
  process.stdout.write(
    `Persona endpoint: ${new URL(first.session.url).pathname.split("/")[2]}\n`,
  );
  await page.context().close();
};

/** Moving the watcher must still allow and record the current turn's requested edit. */
const currentApproval = async () => {
  const page = await openNet();
  const allowed: PersonaAllowedEdit[] = [];
  let admitted = false;
  faux.setResponses([
    toolCall("getLatestNetDefinition", {}, "current-read"),
    toolCall(
      "removePlace",
      { placeId: "victim", targetSubnetId: null },
      "current-remove",
    ),
    fauxAssistantMessage([fauxText("Current edit completed.")]),
  ]);
  const result = await submitPersonaBrowserTurn(
    page,
    "Read the net and remove Victim.",
    {
      signal: AbortSignal.timeout(30_000),
      onAdmission: async () => {
        admitted = true;
      },
      onAllowedEdit: async (edit) => {
        assert(
          admitted,
          "An approval must be recorded after its utterance is admitted",
        );
        allowed.push(edit);
      },
    },
  );
  assert.deepEqual(allowed, [{ items: ["Remove place — Victim"] }]);
  const removal = netCalls(result.snapshot).find(
    ({ toolCallId }) => toolCallId === openaiCallId("current-remove"),
  );
  assert(removal && isAppliedChange(removal));
  const stored = await fixture.storedDocument<{ sdcpn: SDCPN }>(
    page,
    documentId,
  );
  assert.deepEqual(
    stored?.sdcpn.places.map(({ name }) => name),
    ["Keeper"],
  );
  await page.context().close();
};

/** An unanswered panel can survive a failed stream, but must not poison the next persona turn. */
const staleApprovalAfterDisconnect = async () => {
  const page = await openNet();
  const approval = page.getByRole("region", {
    name: "Approve destructive edits",
    exact: true,
  });
  const stop = page.getByRole("button", {
    name: "Stop AI response",
    exact: true,
  });
  faux.setResponses([
    toolCall("getLatestNetDefinition", {}, "stale-read"),
    toolCall(
      "removePlace",
      { placeId: "victim", targetSubnetId: null },
      "stale-remove",
    ),
  ]);
  // A normal composer turn leaves the approval unanswered. No fabricated panel.
  await fixture.send(page, "Read the net and remove Victim.");
  await approval.waitFor({ state: "visible", timeout: 15_000 });
  assert(await stop.isVisible());
  fixture.cutStreams(10);
  try {
    await stop.waitFor({ state: "hidden", timeout: 20_000 });
    assert(
      await approval.isVisible(),
      "The failed turn must leave the real pending approval visible",
    );
  } finally {
    fixture.restoreStreams();
  }

  const answer = "No old edit approved.";
  // The new utterance may join the still-running server submission or start its own.
  faux.setResponses([
    fauxAssistantMessage([fauxText(answer)]),
    fauxAssistantMessage([fauxText(answer)]),
  ]);
  const allowed: PersonaAllowedEdit[] = [];
  const result = await submitPersonaBrowserTurn(
    page,
    "Do not remove Victim; just reply.",
    {
      signal: AbortSignal.timeout(75_000),
      onAllowedEdit: async (edit) => {
        allowed.push(edit);
      },
    },
  );
  assert.equal(result.reply.text, answer);
  assert.deepEqual(
    allowed,
    [],
    "Do not attribute an old approval to the new utterance",
  );
  const stored = await fixture.storedDocument<{ sdcpn: SDCPN }>(
    page,
    documentId,
  );
  assert.deepEqual(
    stored?.sdcpn.places.map(({ name }) => name),
    ["Victim", "Keeper"],
  );
  assert(
    !netCalls(result.snapshot).some(
      (call) =>
        call.toolCallId === openaiCallId("stale-remove") &&
        isAppliedChange(call),
    ),
  );
  await page.context().close();
};

try {
  for (const witness of [
    personaAdmission,
    currentApproval,
    staleApprovalAfterDisconnect,
  ]) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Cases share the scripted provider queue.
    await witness();
    process.stdout.write(`PASS ${witness.name}\n`);
  }
  assert.deepEqual(fixture.errors, []);
  assert.deepEqual(fixture.blocked, []);
  process.stdout.write("PERSONA_BROWSER_WITNESS_PASS\n");
} finally {
  try {
    await fixture.close();
  } finally {
    await app.stop();
  }
}

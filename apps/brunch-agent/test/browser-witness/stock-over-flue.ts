/** Manual witness: Stock's canonical tools through the built F-mode website and Flue transport. */
import assert from "node:assert/strict";

import { fauxAssistantMessage, fauxText } from "@earendil-works/pi-ai";

import { brunchModes } from "@hashintel/brunch-agent";
import { clientToolHistoryFrom } from "@hashintel/brunch-agent-transport-aisdk";

import { loadBuiltBrunchApplication } from "../load-built-application.ts";
import {
  installFauxOpenai,
  openaiCallId,
  openBrowserFixture,
  prepareWitnessProcess,
  toolCall,
} from "./browser-fixture.ts";

prepareWitnessProcess("stock-over-flue-browser-witness");
const faux = installFauxOpenai();
const app = await loadBuiltBrunchApplication();
const fixture = await openBrowserFixture(app);
try {
  const page = await fixture.openAssistant();
  faux.setResponses([
    toolCall(
      "addPlace",
      {
        id: "queue",
        name: "Queue",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 0,
        y: 0,
        targetSubnetId: null,
      },
      "f-place-1",
    ),
    fauxAssistantMessage([fauxText("Stock-over-Flue place finished.")]),
  ]);
  const delivery = await fixture.ask(
    page,
    "Add a Queue place directly to this empty net.",
    "Stock-over-Flue place finished.",
    30_000,
  );
  assert.equal(delivery.kind, "user");
  assert.equal(delivery.initialData?.mode, brunchModes.stockOverFlue);
  const { binding, client } = await fixture.conversationOf(page, delivery);
  const history = await client.history();
  const results = clientToolHistoryFrom(history.messages).results;
  assert.deepEqual(
    results.map(({ toolName }) => toolName),
    ["addPlace"],
  );
  const result = results.find(
    ({ toolCallId }) => toolCallId === openaiCallId("f-place-1"),
  );
  assert(result, "No Flue result for canonical F-mode addPlace");
  assert.deepEqual(result.output, {
    applied: true,
    title: "Added place Queue",
    target: { kind: "selection", item: { type: "place", id: "queue" } },
  });
  assert.equal(
    result.metadata,
    undefined,
    "F must not attach a Brunch mutation record",
  );
  const issued = history.messages
    .flatMap((message) =>
      message.role === "assistant" && message.purpose === "assistant"
        ? message.parts
        : [],
    )
    .filter((part) => part.type === "dynamic-tool");
  assert.deepEqual(
    issued.map(({ toolName }) => toolName),
    ["addPlace"],
    "F must not issue Brunch Ledger or projection tools",
  );
  assert.equal(issued[0]?.state, "output-available");
  const stored = await fixture.storedDocument<{
    incarnationId: string;
    sdcpn: { places: { id: string }[] };
  }>(page, binding.documentId);
  assert.equal(stored?.incarnationId, binding.incarnationId);
  assert(stored.sdcpn.places.some(({ id }) => id === "queue"));
  assert.equal(await page.getByRole("tab", { name: /^Ledger/u }).count(), 0);
  assert.deepEqual(fixture.errors, []);
  assert.deepEqual(fixture.blocked, []);
  process.stdout.write("STOCK_OVER_FLUE_BROWSER_WITNESS_PASS\n");
} finally {
  try {
    await fixture.close();
  } finally {
    await app.stop();
  }
}

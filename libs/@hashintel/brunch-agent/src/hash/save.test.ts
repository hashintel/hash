import { expect, test } from "vitest";

import {
  hashSaveDescription,
  hashSaveForModel,
  hashSaveUnconfirmedNote,
  parseHashSaveInput,
  parseHashSaveOutcome,
  versionLoadNote,
} from "./save";

test("a save names the open document and nothing else", () => {
  expect(parseHashSaveInput({ documentId: "web~net" })).toEqual({
    documentId: "web~net",
  });
  expect(() => parseHashSaveInput({ documentId: "" })).toThrow(
    /Invalid length/u,
  );
  expect(() =>
    parseHashSaveInput({ documentId: "web~net", title: "Net" }),
  ).toThrow(/Invalid key/u);
});

test.each([
  {
    status: "saved",
    decisionTime: "2026-10-24T01:00:00.000Z",
    title: "Net",
    stillDirty: false,
  },
  { status: "saved", decisionTime: null, title: "Net", stillDirty: true },
  { status: "unconfirmed", error: "Failed to fetch" },
  { status: "not-started", reason: "The user declined this save." },
])("a save settles as $status", (outcome) => {
  expect(parseHashSaveOutcome(outcome)).toEqual(outcome);
});

test.each([
  { applied: false, reason: "An edit's refusal" },
  { saved: false, error: "Failed to fetch" },
  { status: "saved", title: "Net" },
  { status: "not-started" },
  null,
])("a save never settles as %j", (value) => {
  expect(() => parseHashSaveOutcome(value)).toThrow(/Invalid/u);
});

test("Save's description and note are pinned", () => {
  expect(hashSaveUnconfirmedNote).toMatchInlineSnapshot(
    `"The save is not confirmed: a version may or may not have been written. Tell the user, who can check the version list, and don't call app_save_net again until they ask."`,
  );
  expect(hashSaveDescription("web~net")).toMatchInlineSnapshot(
    `"Save the net open in the editor to HASH as a new version, exactly as the editor's Save button does; others who can see the net then see that version. The net open in the editor is documentId "web~net". Call it only when the user asks for a save or agrees to one you offered. The user approves each save on a card; it saves the net as the editor holds it then, with every unsaved edit, the user's and yours. It saves only the net: this conversation and its Ledger stay in Brunch and are not saved into HASH. Returns { saved: true, decisionTime, title, stillDirty } when saved: decisionTime is the saved version's time, and stillDirty means edits made since are not in it. Returns { saved: false, error, note } when the page could not confirm the save, and fails with an error carrying the same note when the page's answer was lost: The save is not confirmed: a version may or may not have been written. Tell the user, who can check the version list, and don't call app_save_net again until they ask. Returns { saved: false, reason } when it did not start (the user declined, the net is read-only or unsaved, it has no unsaved changes, a save is already in progress, or it isn't the open net): nothing was saved. If it is refused because the document changed since your last view of the net, read the net, then call it again."`,
  );
});

test("each save outcome renders for the model, keys in order", () => {
  expect(
    JSON.stringify(
      hashSaveForModel({
        status: "saved",
        decisionTime: "2026-10-24T01:00:00.000Z",
        title: "Net",
        stillDirty: false,
      }),
    ),
  ).toMatchInlineSnapshot(
    `"{"saved":true,"decisionTime":"2026-10-24T01:00:00.000Z","title":"Net","stillDirty":false}"`,
  );
  expect(
    JSON.stringify(
      hashSaveForModel({ status: "unconfirmed", error: "Failed to fetch" }),
    ),
  ).toMatchInlineSnapshot(
    `"{"saved":false,"error":"Failed to fetch","note":"The save is not confirmed: a version may or may not have been written. Tell the user, who can check the version list, and don't call app_save_net again until they ask."}"`,
  );
  expect(
    JSON.stringify(
      hashSaveForModel({
        status: "not-started",
        reason: "The user declined this save.",
      }),
    ),
  ).toMatchInlineSnapshot(
    `"{"saved":false,"reason":"The user declined this save."}"`,
  );
});

test("a save in an unknown shape throws", () => {
  expect(() => hashSaveForModel({ status: "maybe" })).toThrow(
    "HASH's page returned a save in an unknown shape.",
  );
});

test("the version-load note is pinned", () => {
  expect(
    versionLoadNote({
      id: "version",
      decisionTime: "2026-10-24T01:00:00.000Z",
    }),
  ).toMatchInlineSnapshot(
    `"Host note: The user loaded the version saved at 2026-10-24T01:00:00.000Z; later saves build on it."`,
  );
});

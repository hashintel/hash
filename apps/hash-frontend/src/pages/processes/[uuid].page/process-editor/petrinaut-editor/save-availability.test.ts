import { expect, test } from "vitest";

import { agentSaveRefusal, saveRefusal } from "./save-availability";

import type { NetMode } from "../petrinaut-editor";
import type { EntityId } from "@blockprotocol/type-system";

const openId = "web~net" as EntityId;

const savedMode: NetMode = { kind: "saved", entityId: openId };
const draftMode: NetMode = {
  kind: "draft",
  seedKey: null,
  entityId: "web~draft" as EntityId,
};

const booleans = [false, true] as const;
const allFacts = booleans.flatMap((readonly) =>
  booleans.flatMap((saving) =>
    booleans.map((isDirty) => ({ readonly, saving, isDirty })),
  ),
);

test.each([
  {
    facts: { readonly: true, saving: true, isDirty: false },
    refusal: "readonly",
  },
  {
    facts: { readonly: false, saving: true, isDirty: false },
    refusal: "saving",
  },
  {
    facts: { readonly: false, saving: false, isDirty: false },
    refusal: "clean",
  },
  { facts: { readonly: false, saving: false, isDirty: true }, refusal: null },
])("Save is $refusal for $facts", ({ facts, refusal }) => {
  expect(saveRefusal(facts)).toBe(refusal);
});

test.each([
  {
    refused: "no net",
    mode: null,
    fromOpenLoad: true,
    documentId: openId,
    reason:
      "The net is an unsaved draft, which the user creates with the editor's Create.",
  },
  {
    refused: "a draft",
    mode: draftMode,
    fromOpenLoad: true,
    documentId: openId,
    reason:
      "The net is an unsaved draft, which the user creates with the editor's Create.",
  },
  {
    refused: "another net",
    mode: savedMode,
    fromOpenLoad: true,
    documentId: "web~other",
    reason: "That isn't the net open in the editor.",
  },
  {
    refused: "the open net from an earlier load",
    mode: savedMode,
    fromOpenLoad: false,
    documentId: openId,
    reason: "That isn't the net open in the editor.",
  },
])(
  "the agent's save of $refused is refused for that first, whatever else holds",
  ({ mode, fromOpenLoad, documentId, reason }) => {
    for (const facts of allFacts) {
      expect(
        agentSaveRefusal({ ...facts, mode, fromOpenLoad }, documentId),
      ).toBe(reason);
    }
  },
);

test.each([
  {
    facts: { readonly: true, saving: true, isDirty: false },
    reason: "The user can't edit this net, so they can't save it.",
  },
  {
    facts: { readonly: false, saving: true, isDirty: false },
    reason: "A save of this net is already in progress.",
  },
  {
    facts: { readonly: false, saving: false, isDirty: false },
    reason: "There are no unsaved changes to save.",
  },
  { facts: { readonly: false, saving: false, isDirty: true }, reason: null },
])(
  "the agent's save of the open net is refused with $reason for $facts",
  ({ facts, reason }) => {
    expect(
      agentSaveRefusal(
        { ...facts, mode: savedMode, fromOpenLoad: true },
        openId,
      ),
    ).toBe(reason);
  },
);

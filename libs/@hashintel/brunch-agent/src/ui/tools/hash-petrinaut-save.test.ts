import { expect, test, vi } from "vitest";

import * as brunchAgent from "@hashintel/brunch-agent";

import { createHashPetrinautSaveTool } from "./hash-petrinaut-save";

import type { PetrinautAiAutomaticToolExecuteParams } from "../chat/ai-automatic-tool";
import type { BrunchHostSave } from "./brunch-mutation-approval";

const params = (
  signal: AbortSignal,
): PetrinautAiAutomaticToolExecuteParams => ({
  input: { documentId: "web~net" },
  signal,
  toolCallId: "save",
  get edit(): never {
    throw new Error("The save adapter must not edit the net");
  },
  get handle(): never {
    throw new Error("The save adapter must not read the net");
  },
  get document(): never {
    throw new Error("The save adapter must not access the document");
  },
  get experiments(): never {
    throw new Error("The save adapter must not run experiments");
  },
  readDiagnosticsContext: async () => "",
});

const hostSaveWith = (save: BrunchHostSave["save"]): BrunchHostSave => ({
  read: () => ({ title: "Net", lastSavedTime: null, refusal: null }),
  save,
});

const outcomes: brunchAgent.HashSaveOutcome[] = [
  {
    status: "saved",
    decisionTime: "2026-10-24T01:00:00.000Z",
    title: "Replenishment",
    stillDirty: true,
  },
  { status: "not-started", reason: "The net has no unsaved changes." },
  { status: "unconfirmed", error: "Failed to fetch" },
];

test.each(outcomes)(
  "forwards the host's save outcome unchanged: %j",
  async (outcome) => {
    const save = vi.fn<BrunchHostSave["save"]>().mockResolvedValue(outcome);
    const parse = vi.spyOn(brunchAgent, "parseHashSaveInput");
    const tool = createHashPetrinautSaveTool(hostSaveWith(save));
    const signal = new AbortController().signal;

    expect(tool.toolName).toBe(brunchAgent.brunchTools.appSaveNet);
    const execution = params(signal);
    execution.input = tool.inputParser.parse(execution.input);
    const result = await tool.execute(execution);
    expect(parse).toHaveBeenCalledExactlyOnceWith({ documentId: "web~net" });
    parse.mockRestore();
    expect(save).toHaveBeenCalledExactlyOnceWith("web~net", signal);
    expect(result).toBe(outcome);
    expect(tool.outputParser.parse(result)).toBe(outcome);
  },
);

test("rejects invalid raw input before saving", () => {
  const save = vi.fn<BrunchHostSave["save"]>();
  const tool = createHashPetrinautSaveTool(hostSaveWith(save));
  const execution = params(new AbortController().signal);
  execution.input = { documentId: 42 };
  expect(() => tool.execute(execution)).toThrow();
  expect(save).not.toHaveBeenCalled();
});

test("forwards cancellation to the host and preserves its rejection", async () => {
  const controller = new AbortController();
  const save = vi.fn<BrunchHostSave["save"]>(
    (_documentId, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      }),
  );
  const tool = createHashPetrinautSaveTool(hostSaveWith(save));
  const pending = tool.execute(params(controller.signal));
  const reason = new Error("Save abandoned");
  const rejected = expect(pending).rejects.toBe(reason);
  controller.abort(reason);

  await rejected;
  expect(save).toHaveBeenCalledExactlyOnceWith("web~net", controller.signal);
});

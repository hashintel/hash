import { expect, test, vi } from "vitest";

import {
  brunchTools,
  type HashNetSaveOutcome,
  type SaveHashNetForAgent,
  hashNetSaveInputParser,
} from "@hashintel/brunch-agent";

import { createHashPetrinautSaveTool } from "./hash-petrinaut-save";

import type { PetrinautAiAutomaticToolExecuteParams } from "../chat/ai-automatic-tool";

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
  readDiagnosticsContext: async () => "",
});

const outcomes: HashNetSaveOutcome[] = [
  {
    saved: true,
    decisionTime: "2026-10-24T01:00:00.000Z",
    title: "Replenishment",
    stillDirty: true,
  },
  { applied: false, reason: "The net has no unsaved changes." },
  { saved: false, error: "Failed to fetch" },
];

test.each(outcomes)(
  "forwards the host's save outcome unchanged: %j",
  async (outcome) => {
    const save = vi.fn<SaveHashNetForAgent>().mockResolvedValue(outcome);
    const tool = createHashPetrinautSaveTool(save);
    const signal = new AbortController().signal;

    expect(tool.toolName).toBe(brunchTools.saveHashNet);
    const parse = vi.spyOn(hashNetSaveInputParser, "parse");
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
  const save = vi.fn<SaveHashNetForAgent>();
  const tool = createHashPetrinautSaveTool(save);
  const execution = params(new AbortController().signal);
  execution.input = { documentId: 42 };
  expect(() => tool.execute(execution)).toThrow();
  expect(save).not.toHaveBeenCalled();
});

test("forwards cancellation to the host and preserves its rejection", async () => {
  const controller = new AbortController();
  const save = vi.fn<SaveHashNetForAgent>(
    (_documentId, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      }),
  );
  const tool = createHashPetrinautSaveTool(save);
  const pending = tool.execute(params(controller.signal));
  const reason = new Error("Save abandoned");
  const rejected = expect(pending).rejects.toBe(reason);
  controller.abort(reason);

  await rejected;
  expect(save).toHaveBeenCalledExactlyOnceWith("web~net", controller.signal);
});

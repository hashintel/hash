import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  getModelType,
  normalizeContext,
} from "@earendil-works/pi-ai";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { resolveModel, setProvider } from "@flue/runtime/internal";
import { afterEach, describe, expect, test, vi } from "vitest";

import { DEFAULT_CHAT_MODEL } from "../shared/chat-model.ts";
import { openaiProviderWithAddedModels } from "./openai-provider.ts";

const snapshotId = "gpt-5.5-2026-04-23";
const ids = (models: readonly { readonly id: string }[]) =>
  models.map((model) => model.id);
const occurrences = (models: readonly { readonly id: string }[], id: string) =>
  ids(models).filter((entry) => entry === id).length;

afterEach(() => {
  vi.unstubAllEnvs();
});

test("the default model is the dated snapshot this provider adds", () => {
  expect(DEFAULT_CHAT_MODEL).toBe(`openai/${snapshotId}`);
  expect(occurrences(openaiProvider().getModels(), snapshotId)).toBe(0);
});

test("the snapshot inherits Pi's GPT-5.5 metadata under its dated id, and nothing else is copied", () => {
  const upstream = openaiProvider();
  const provider = openaiProviderWithAddedModels();
  const alias = upstream.getModels().find((model) => model.id === "gpt-5.5");
  const snapshot = provider
    .getModels()
    .find((model) => model.id === snapshotId);
  expect(alias).toBeDefined();
  expect(snapshot).toEqual({
    ...alias,
    id: snapshotId,
    name: "GPT-5.5 (2026-04-23)",
  });
  expect(ids(provider.getModels())).toEqual([
    ...ids(upstream.getModels()),
    snapshotId,
  ]);
  expect(ids(provider.getAllModels?.() ?? [])).toEqual([
    ...ids(upstream.getAllModels?.() ?? []),
    snapshotId,
  ]);
});

describe("every catalogue read Pi and Flue expose resolves the snapshot exactly once", () => {
  test("Pi Models lookups", async () => {
    vi.stubEnv("OPENAI_API_KEY", "synthetic-not-a-credential");
    const models = createModels();
    models.setProvider(openaiProviderWithAddedModels());

    expect(models.getModel("openai", snapshotId)?.id).toBe(snapshotId);
    expect(models.getModelOfType("chat", "openai", snapshotId)?.id).toBe(
      snapshotId,
    );
    for (const listed of [
      models.getModels("openai"),
      models.getModels(),
      models.getAllModels("openai"),
      models.getModelsOfType("chat", "openai"),
      await models.getAvailable("openai"),
      await models.getAllAvailable("openai"),
    ]) {
      expect(occurrences(listed, snapshotId)).toBe(1);
      // Pi keeps ids unique within each model type, not across types.
      expect(
        new Set(listed.map((model) => `${getModelType(model)}:${model.id}`))
          .size,
      ).toBe(listed.length);
    }
  });

  test("Flue model resolution", () => {
    setProvider(openaiProviderWithAddedModels());
    expect(resolveModel(DEFAULT_CHAT_MODEL)).toMatchObject({
      provider: "openai",
      id: snapshotId,
      api: "openai-responses",
    });
  });
});

describe("a substituted provider factory", () => {
  test("keeps the faux streams and still resolves the snapshot", async () => {
    const faux = fauxProvider({ provider: "openai" });
    vi.resetModules();
    vi.doMock("@earendil-works/pi-ai/providers/openai", () => ({
      openaiProvider: () => faux.provider,
    }));
    try {
      const { openaiProviderWithAddedModels: withFaux } =
        await import("./openai-provider.ts");
      const provider = withFaux();
      expect(ids(provider.getModels())).toEqual([
        ...ids(faux.provider.getModels()),
        snapshotId,
      ]);
      const snapshot = provider
        .getModels()
        .find((model) => model.id === snapshotId);
      if (snapshot === undefined) throw new Error("Snapshot missing.");
      faux.setResponses([fauxAssistantMessage([fauxText("Faux reply.")])]);
      const reply = await provider
        .streamSimple(snapshot, normalizeContext({ messages: [] }))
        .result();
      expect(reply.content).toMatchObject([
        { type: "text", text: "Faux reply." },
      ]);
    } finally {
      vi.doUnmock("@earendil-works/pi-ai/providers/openai");
      vi.resetModules();
    }
  });
});

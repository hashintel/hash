/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { isValidElement, useLayoutEffect } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  InProcessLspWorker,
  NoopResizeObserver,
} from "../../shared/petrinaut-jsdom";
import { renderEditorWith } from "../_shared/testing/render-editor-with";
import { stubLocalStorage } from "../_shared/testing/stub-local-storage";
import { brunchPlugin } from "../brunch/plugin";
import { voicePlugin } from "./plugin";

import type { AssistantChatProps } from "../_shared/chat/assistant-chat";
import type { PetrinautAiVoiceModeContext } from "../_shared/chat/composer-control";
import type { createVoicePlugin, VoiceService } from "./definition";
import type { PluginApi, PluginHook } from "@hashintel/petrinaut/ui";

await vi.hoisted(async () => {
  const { installPetrinautDomShims } =
    await import("../../shared/petrinaut-jsdom");
  installPetrinautDomShims();
});

vi.mock("@flue/sdk", () => ({
  createFlueClient: () => ({
    observe: () => ({
      close: () => {},
      getSnapshot: () => ({ phase: "absent" }),
      refresh: () => {},
      subscribe: () => () => {},
    }),
  }),
}));
vi.mock("../brunch/brunch-preview-config", () => ({
  brunchPreviewConfig: {
    chatEndpoint: "/agents/chat",
    isBrunchConfigured: true,
  },
}));
vi.mock("../brunch/conversation/brunch-principal", () => ({
  getOrCreateBrunchPrincipal: () => "test-principal",
}));
/** The props of the chat the shown assistant renders, Voice's included. */
const chats = vi.hoisted(() => ({ latest: null as unknown }));
vi.mock("../_shared/chat/assistant-chat", () => ({
  AssistantChat: (props: unknown) => {
    useLayoutEffect(() => {
      chats.latest = props;
    });
    return null;
  },
}));

const voiceConfigResponse = (available: boolean) =>
  Response.json(
    available ? { available, connectionTimeoutMs: 10_000 } : { available },
  );

beforeEach(() => {
  stubLocalStorage();
  chats.latest = null;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  // The language server starts lazily, past the test that rendered the editor.
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  vi.stubGlobal("Worker", InProcessLspWorker);
});

describe("Voice's hook", () => {
  type Settings = { voice: boolean; realtime: boolean };
  const recorded = {
    startActionIds: [] as readonly string[],
    service: undefined as VoiceService | undefined,
  };

  /** Runs Voice's hook as the editor does; Brunch's service is absent outside an editor. */
  const VoiceProbe = ({
    shown,
    settings,
  }: {
    shown: boolean;
    settings: Settings;
  }) => {
    const useVoicePlugin = voicePlugin.hook as PluginHook<
      typeof createVoicePlugin
    >;
    const { assistant, provides } = useVoicePlugin({
      errors: { capture: () => {} },
      notifications: { add: () => "" },
      assistant: { isActive: shown },
      // The settings store types `get` by each spec; these two are switches.
      settings: {
        get: (key: keyof Settings) => settings[key],
        set: () => {},
      } as PluginApi<typeof createVoicePlugin>["settings"],
    });
    recorded.startActionIds = assistant.startActions?.map(({ id }) => id) ?? [];
    recorded.service = provides;
    return null;
  };

  const renderVoice = (shown: boolean, settings: Partial<Settings> = {}) => {
    const props = (nextShown: boolean, nextSettings: Partial<Settings>) => ({
      shown: nextShown,
      settings: { voice: true, realtime: false, ...nextSettings },
    });
    const view = render(<VoiceProbe {...props(shown, settings)} />);
    return {
      rerender: (nextShown: boolean, nextSettings: Partial<Settings> = {}) =>
        view.rerender(<VoiceProbe {...props(nextShown, nextSettings)} />),
    };
  };

  const voiceProvider = () => {
    const control = recorded.service?.renderVoiceMode?.(
      {} as PetrinautAiVoiceModeContext,
    );
    if (!isValidElement<{ config: { provider?: string } }>(control)) {
      throw new Error("Expected a configured Voice control.");
    }
    return control.props.config.provider;
  };

  test("offers voice once the deployment answers, Live unless Realtime is chosen", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => voiceConfigResponse(true)),
    );
    const view = renderVoice(true);
    expect(recorded.startActionIds).toEqual([]);

    await waitFor(() => expect(recorded.startActionIds).toEqual(["voice"]));
    expect(voiceProvider()).toBe("live");
    view.rerender(true, { realtime: true });
    expect(voiceProvider()).toBe("realtime");
  });

  test("offers no voice when the setting is off or the deployment has none", async () => {
    const fetch = vi.fn(async () => voiceConfigResponse(true));
    vi.stubGlobal("fetch", fetch);
    renderVoice(true, { voice: false });
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await act(async () => {});
    expect(recorded.service?.renderVoiceMode).toBeUndefined();
    expect(recorded.startActionIds).toEqual([]);
    cleanup();

    fetch.mockImplementation(async () => voiceConfigResponse(false));
    renderVoice(true);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(recorded.service?.renderVoiceMode).toBeUndefined();
    expect(recorded.startActionIds).toEqual([]);
  });

  test("checks the capability afresh each time Brunch is shown and offers nothing while it is not", async () => {
    const first = Promise.withResolvers<Response>();
    const second = Promise.withResolvers<Response>();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    vi.stubGlobal("fetch", fetch);
    const view = renderVoice(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(recorded.startActionIds).toEqual([]);

    view.rerender(true);
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(recorded.service?.renderVoiceMode).toBeUndefined();
    await act(async () => first.resolve(voiceConfigResponse(true)));
    expect(recorded.startActionIds).toEqual(["voice"]);

    view.rerender(false);
    expect(recorded.startActionIds).toEqual([]);
    expect(recorded.service?.renderVoiceMode).toBeUndefined();

    // An earlier answer never applies to a later check.
    view.rerender(true);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(recorded.service?.renderVoiceMode).toBeUndefined();
    await act(async () => second.resolve(voiceConfigResponse(true)));
    expect(recorded.startActionIds).toEqual(["voice"]);
  });
});

describe("Voice in the editor", () => {
  test("adds its voice mode to Brunch's chat and its start action to the empty-net prompt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => voiceConfigResponse(true)),
    );
    renderEditorWith([brunchPlugin, voicePlugin]);

    expect(
      await screen.findByRole("button", { name: "Start voice mode" }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(
        (chats.latest as AssistantChatProps | null)?.renderVoiceMode,
      ).toBeTypeOf("function"),
    );
    expect((chats.latest as AssistantChatProps).presentation).toBe("brunch");

    // Voice speaks approvals from Brunch's approval authority.
    const control = (chats.latest as AssistantChatProps).renderVoiceMode?.(
      {} as PetrinautAiVoiceModeContext,
    );
    if (
      !isValidElement<{
        toolApprovalState?: (toolCallId: string) => unknown;
      }>(control)
    ) {
      throw new Error("Expected a configured Voice control.");
    }
    expect(control.props.toolApprovalState?.("no-such-call")).toBeNull();
  });

  test("is off and needs Brunch while Brunch is switched off", async () => {
    stubLocalStorage({
      "petrinaut:user-settings": { disabledPluginIds: ["website.brunch"] },
    });
    const fetch = vi.fn(async () => voiceConfigResponse(true));
    vi.stubGlobal("fetch", fetch);
    renderEditorWith([brunchPlugin, voicePlugin]);

    fireEvent.keyDown(window, { key: ",", metaKey: true });
    fireEvent.click(await screen.findByRole("tab", { name: "Plugins" }));
    const row = await screen.findByRole("group", { name: "Voice" });
    expect(row.textContent).toContain("Needs Brunch");
    expect(
      within(
        screen.getByRole("group", { name: "Brunch" }),
      ).getByRole<HTMLInputElement>("checkbox", { name: "Brunch" }).checked,
    ).toBe(false);
    expect(
      screen.queryByRole("button", { name: "Start voice mode" }),
    ).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

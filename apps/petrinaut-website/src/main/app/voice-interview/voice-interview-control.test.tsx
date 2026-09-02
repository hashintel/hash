/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { StrictMode, useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { OpenAIRealtimeSession } from "./openai-realtime-session";
import {
  acknowledgeVoiceInterviewDisclosure,
  isVoiceInterviewDisclosureAcknowledged,
  loadOpenAIVoiceConfig,
  VOICE_INTERVIEW_DISCLOSURE_STORAGE_KEY,
  VoiceInterviewControl,
} from "./voice-interview-control";
import { VoiceTurnController } from "./voice-turn-controller";

import type {
  PetrinautAiVoiceModeContext,
  PetrinautAiVoiceModeControls,
  PetrinautAiVoiceSessionState,
} from "@hashintel/petrinaut/ui";

const config = { available: true as const, connectionTimeoutMs: 15_000 };

let registeredVoiceModeControls: PetrinautAiVoiceModeControls | undefined;

const VoiceInterviewHarness = () => {
  "use no memo";

  const [active, setActive] = useState(false);
  const [inputMode, setInputMode] =
    useState<PetrinautAiVoiceModeContext["inputMode"]>("text");
  const [isAiAssistantOpen, setAiAssistantOpen] = useState(true);
  // Stands in for Petrinaut, which renders every live Voice surface from the
  // state this control reports.
  const [sessionState, setSessionState] =
    useState<PetrinautAiVoiceSessionState | null>(null);
  const context: PetrinautAiVoiceModeContext = {
    canAcceptVoiceInput: true,
    conversationId: "voice-control-test",
    inputMode,
    isAiAssistantOpen,
    messages: [],
    registerVoiceModeControls: (controls) => {
      registeredVoiceModeControls = controls;
      return () => {
        if (registeredVoiceModeControls === controls) {
          registeredVoiceModeControls = undefined;
        }
      };
    },
    reportVoiceSessionState: setSessionState,
    setInputMode,
    setVoiceActive: setActive,
    status: "ready",
    stop: vi.fn(async () => undefined),
    submitText: vi.fn(async () => ({
      kind: "message" as const,
      messageId: "typed-answer",
    })),
    submitVoiceInput: vi.fn(async () => ({
      kind: "message" as const,
      messageId: "voice-answer",
    })),
  };

  return (
    <>
      <button type="button" onClick={() => setInputMode("voice")}>
        Select Voice
      </button>
      <button type="button" onClick={() => setInputMode("text")}>
        Select Text
      </button>
      <button
        type="button"
        onClick={() => setAiAssistantOpen((currentOpen) => !currentOpen)}
      >
        Toggle panel
      </button>
      {/* Mirrors Petrinaut's End control, which ends the session and returns
          the composer to text. */}
      <button
        type="button"
        onClick={() => {
          void registeredVoiceModeControls?.end();
          setActive(false);
          setInputMode("text");
        }}
      >
        End session
      </button>
      <output>
        {sessionState === null
          ? "No session"
          : `Session: ${sessionState.phase}`}
      </output>
      <output>{active ? "Voice active" : "Voice inactive"}</output>
      <output>{inputMode === "voice" ? "Voice mode" : "Text mode"}</output>
      <output>{isAiAssistantOpen ? "Panel open" : "Panel closed"}</output>
      <VoiceInterviewControl {...context} config={config} />
    </>
  );
};

const stubUnavailableMicrophone = () => {
  const getUserMedia = vi.fn(async () => {
    throw new DOMException("Permission denied", "NotAllowedError");
  });
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ available: true, connectionTimeoutMs: 15_000 }),
    ),
  );
  vi.stubGlobal(
    "AudioContext",
    class {
      public readonly state = "suspended";
      public readonly close = vi.fn(async () => undefined);
      public readonly resume = vi.fn(async () => undefined);
    },
  );
  vi.stubGlobal("navigator", {
    mediaDevices: { getUserMedia },
  });
  return getUserMedia;
};

beforeEach(() => {
  registeredVoiceModeControls = undefined;
  vi.stubGlobal(
    "PointerEvent",
    class extends MouseEvent {
      public readonly pointerType: string;

      public constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerType = init.pointerType ?? "";
      }
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      public disconnect() {}
      public observe() {}
      public unobserve() {}
    },
  );
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    } satisfies Storage,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("voice interview control", () => {
  test("stores and reads the versioned disclosure acknowledgement", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    expect(isVoiceInterviewDisclosureAcknowledged(storage)).toBe(false);
    acknowledgeVoiceInterviewDisclosure(storage);
    expect(values.get(VOICE_INTERVIEW_DISCLOSURE_STORAGE_KEY)).toBe(
      "acknowledged",
    );
    expect(isVoiceInterviewDisclosureAcknowledged(storage)).toBe(true);
  });

  test("fails safe when disclosure storage is unavailable", () => {
    const unavailableStorage = {
      getItem: () => {
        throw new DOMException("Blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("Blocked", "SecurityError");
      },
    };

    expect(isVoiceInterviewDisclosureAcknowledged(unavailableStorage)).toBe(
      false,
    );
    expect(() =>
      acknowledgeVoiceInterviewDisclosure(unavailableStorage),
    ).not.toThrow();
  });

  test("loads only a schema-valid available server configuration", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ available: true, connectionTimeoutMs: 15_000 }),
    );

    await expect(loadOpenAIVoiceConfig(fetch)).resolves.toEqual(config);
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/voice/config");
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      cache: "no-store",
      method: "GET",
    });

    fetch.mockResolvedValueOnce(
      Response.json({ available: false, connectionTimeoutMs: 15_000 }),
    );
    await expect(loadOpenAIVoiceConfig(fetch)).resolves.toBeNull();
    fetch.mockResolvedValueOnce(
      Response.json({ available: true, connectionTimeoutMs: "15000" }),
    );
    await expect(loadOpenAIVoiceConfig(fetch)).resolves.toBeNull();
  });

  test("keeps the first-use disclosure inline without a text-handoff action", () => {
    render(<VoiceInterviewHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Select Voice" }));

    const disclosure = screen.getByRole("region", {
      name: "Voice mode consent",
    });
    expect(disclosure).not.toBeNull();
    expect(within(disclosure).getByText("Voice mode")).not.toBeNull();
    expect(
      screen.getByText("OpenAI processes live audio", { exact: false }),
    ).not.toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Start voice mode" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.queryByRole("button", { name: "Use text instead" }),
    ).toBeNull();
    expect(
      screen.queryByRole("region", { name: "Voice interview stage" }),
    ).toBeNull();
    expect(document.activeElement).toBe(disclosure);
  });

  test("starts one session after consent and keeps reporting it across host presentation changes", async () => {
    const getUserMedia = stubUnavailableMicrophone();
    render(
      <StrictMode>
        <VoiceInterviewHarness />
      </StrictMode>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select Voice" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Start voice mode" }));

    expect(await screen.findByText("Session: error")).not.toBeNull();
    expect(screen.getByText("Voice active")).not.toBeNull();
    expect(getUserMedia).toHaveBeenCalledOnce();
    // The control itself renders nothing once a session is running.
    expect(screen.queryByRole("region", { name: "Voice session" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Select Text" }));
    fireEvent.click(screen.getByRole("button", { name: "Toggle panel" }));

    expect(screen.getByText("Text mode")).not.toBeNull();
    expect(screen.getByText("Panel closed")).not.toBeNull();
    expect(screen.getByText("Session: error")).not.toBeNull();
  });

  test("starts directly after acknowledgement and ends through the registered control", async () => {
    window.localStorage.setItem(
      VOICE_INTERVIEW_DISCLOSURE_STORAGE_KEY,
      "acknowledged",
    );
    stubUnavailableMicrophone();
    render(<VoiceInterviewHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Select Voice" }));

    expect(
      screen.queryByRole("region", { name: "Voice mode consent" }),
    ).toBeNull();
    expect(await screen.findByText("Session: error")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "End session" }));

    await waitFor(() => {
      expect(screen.getByText("No session")).not.toBeNull();
    });
    expect(screen.getByText("Text mode")).not.toBeNull();
    expect(screen.getByText("Voice inactive")).not.toBeNull();
  });

  test("restarts when Voice is reselected before teardown completes", async () => {
    window.localStorage.setItem(
      VOICE_INTERVIEW_DISCLOSURE_STORAGE_KEY,
      "acknowledged",
    );
    const connect = vi
      .spyOn(OpenAIRealtimeSession.prototype, "connect")
      .mockResolvedValue(1);
    let finishDisconnect: (() => void) | undefined;
    vi.spyOn(OpenAIRealtimeSession.prototype, "disconnect")
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishDisconnect = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    vi.spyOn(
      OpenAIRealtimeSession.prototype,
      "setMicrophoneEnabled",
    ).mockImplementation(() => {});
    render(<VoiceInterviewHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Select Voice" }));
    await screen.findByText("Session: listening");
    fireEvent.click(screen.getByRole("button", { name: "End session" }));
    await screen.findByText("Text mode");
    fireEvent.click(screen.getByRole("button", { name: "Select Voice" }));

    expect(connect).toHaveBeenCalledOnce();
    finishDisconnect?.();

    await waitFor(() => expect(connect).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Voice active")).not.toBeNull();
    expect(screen.getByText("Session: listening")).not.toBeNull();
  });

  test("pauses once when the panel closes and stays paused after reopening", async () => {
    window.localStorage.setItem(
      VOICE_INTERVIEW_DISCLOSURE_STORAGE_KEY,
      "acknowledged",
    );
    vi.spyOn(OpenAIRealtimeSession.prototype, "connect").mockResolvedValue(1);
    vi.spyOn(OpenAIRealtimeSession.prototype, "disconnect").mockResolvedValue();
    vi.spyOn(
      OpenAIRealtimeSession.prototype,
      "setMicrophoneEnabled",
    ).mockImplementation(() => {});
    const pause = vi.spyOn(VoiceTurnController.prototype, "pause");
    render(<VoiceInterviewHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Select Voice" }));
    await screen.findByText("Session: listening");
    expect(registeredVoiceModeControls).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Toggle panel" }));
    await screen.findByText("Session: paused");
    expect(pause).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Toggle panel" }));
    expect(screen.getByText("Session: paused")).not.toBeNull();
    expect(pause).toHaveBeenCalledOnce();
  });

  test("latches panel closure while the Voice connection is pending", async () => {
    window.localStorage.setItem(
      VOICE_INTERVIEW_DISCLOSURE_STORAGE_KEY,
      "acknowledged",
    );
    let finishConnection: ((epoch: number) => void) | undefined;
    vi.spyOn(OpenAIRealtimeSession.prototype, "connect").mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          finishConnection = resolve;
        }),
    );
    vi.spyOn(OpenAIRealtimeSession.prototype, "disconnect").mockResolvedValue();
    const setMicrophoneEnabled = vi
      .spyOn(OpenAIRealtimeSession.prototype, "setMicrophoneEnabled")
      .mockImplementation(() => {});
    render(<VoiceInterviewHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Select Voice" }));
    await screen.findByText("Session: connecting");
    fireEvent.click(screen.getByRole("button", { name: "Toggle panel" }));
    finishConnection?.(1);

    await screen.findByText("Session: paused");
    expect(setMicrophoneEnabled).toHaveBeenCalledWith(false);
    expect(setMicrophoneEnabled).not.toHaveBeenCalledWith(true);
    expect(screen.getByText("Panel closed")).not.toBeNull();
  });

  test("records acknowledgement only when the interview starts", () => {
    stubUnavailableMicrophone();
    render(<VoiceInterviewHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Select Voice" }));
    fireEvent.click(screen.getByRole("button", { name: "Check microphone" }));
    expect(
      window.localStorage.getItem(VOICE_INTERVIEW_DISCLOSURE_STORAGE_KEY),
    ).toBeNull();

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Start voice mode" }));
    expect(
      window.localStorage.getItem(VOICE_INTERVIEW_DISCLOSURE_STORAGE_KEY),
    ).toBe("acknowledged");
  });
});

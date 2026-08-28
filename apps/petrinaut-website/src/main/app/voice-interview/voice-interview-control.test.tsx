/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  acknowledgeVoiceInterviewDisclosure,
  isVoiceInterviewDisclosureAcknowledged,
  loadOpenAIVoiceConfig,
  VOICE_INTERVIEW_DISCLOSURE_STORAGE_KEY,
  VoiceInterviewControl,
  VoiceInterviewControlView,
  type VoiceInterviewControlViewProps,
} from "./voice-interview-control";

import type { VoiceTurnSnapshot } from "./voice-turn-controller";
import type { PetrinautAiInterviewStageContext } from "@hashintel/petrinaut/ui";

const snapshot = {
  canReviseLastAnswer: false,
  currentQuestion: "What happens after approval?",
  errorCode: null,
  errorMessage: "",
  errorRequestId: "",
  lastAnswerDelivery: "none" as const,
  lastCommittedText: "",
  microphoneEnabled: true,
  microphoneLevel: 0.24,
  partialText: "The request goes to",
  phase: "listening" as const,
};

const config = { available: true as const, connectionTimeoutMs: 15_000 };

const viewProps = (
  overrides: Partial<VoiceInterviewControlViewProps> = {},
): VoiceInterviewControlViewProps => ({
  consented: true,
  correction: "",
  coverage: null,
  editing: false,
  microphoneCheck: "",
  onCheckMicrophone: vi.fn(),
  onConsentChange: vi.fn(),
  onCorrectionChange: vi.fn(),
  onDoneSpeaking: vi.fn(),
  onEdit: vi.fn(),
  onEnd: vi.fn(),
  onExpand: vi.fn(),
  onInterrupt: vi.fn(),
  onMinimize: vi.fn(),
  onPause: vi.fn(),
  onReconnect: vi.fn(),
  onRedo: vi.fn(),
  onResume: vi.fn(),
  onStart: vi.fn(),
  onSubmitCorrection: vi.fn(),
  onTypeInstead: vi.fn(),
  placement: "sidebar",
  presentation: "full",
  snapshot,
  ...overrides,
});

const StatefulVoiceInterviewHarness = ({
  onFocusComposer = vi.fn(),
  onOpenSidebar,
}: {
  onFocusComposer?: () => void;
  onOpenSidebar: () => void;
}) => {
  "use no memo";

  const [active, setActive] = useState(false);
  const [interactionMode, setInteractionMode] =
    useState<PetrinautAiInterviewStageContext["interactionMode"]>("chat");
  const [sidebarOpenRequests, setSidebarOpenRequests] = useState(0);
  const context: PetrinautAiInterviewStageContext = {
    canAcceptInterviewAnswer: true,
    conversationId: "interview-test",
    focusComposer: onFocusComposer,
    interactionMode,
    messages: [],
    openSidebar: () => {
      onOpenSidebar();
      setSidebarOpenRequests((requests) => requests + 1);
    },
    placement: "sidebar",
    setActive,
    setInteractionMode,
    status: "ready",
    stop: vi.fn(async () => undefined),
    submitInterviewAnswer: vi.fn(async () => ({
      kind: "message" as const,
      messageId: "voice-answer",
    })),
    submitText: vi.fn(async () => ({
      kind: "message" as const,
      messageId: "typed-answer",
    })),
  };

  return (
    <>
      <button type="button" onClick={() => setInteractionMode("chat")}>
        Select Chat
      </button>
      <button type="button" onClick={() => setInteractionMode("interview")}>
        Select Interview
      </button>
      <output>{active ? "Interview active" : "Interview inactive"}</output>
      <output>
        {interactionMode === "chat" ? "Chat mode" : "Interview mode"}
      </output>
      <output>{sidebarOpenRequests} sidebar open requests</output>
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("voice interview stage", () => {
  test("stores and reads the current disclosure acknowledgement", () => {
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
    await expect(loadOpenAIVoiceConfig(fetch)).resolves.toEqual({
      available: true,
      connectionTimeoutMs: 15_000,
    });
    const [url, request] = fetch.mock.calls[0]!;
    expect(url).toBe("/api/voice/config");
    expect(request).toMatchObject({ cache: "no-store", method: "GET" });
    expect(request?.signal).toBeInstanceOf(AbortSignal);

    fetch.mockResolvedValueOnce(
      Response.json({ available: false, connectionTimeoutMs: 15_000 }),
    );
    await expect(loadOpenAIVoiceConfig(fetch)).resolves.toBeNull();
    fetch.mockResolvedValueOnce(
      Response.json({ available: true, connectionTimeoutMs: "15000" }),
    );
    await expect(loadOpenAIVoiceConfig(fetch)).resolves.toBeNull();
  });

  test("shows disclosure and requires consent before starting", () => {
    const html = renderToStaticMarkup(
      <VoiceInterviewControlView
        {...viewProps({ consented: false, presentation: "start" })}
      />,
    );
    render(
      <VoiceInterviewControlView
        {...viewProps({ consented: false, presentation: "start" })}
      />,
    );

    expect(html).toContain("Voice interview");
    expect(html).toContain("Talk through your process with AI");
    expect(html).toContain("transcribed by OpenAI");
    expect(html).toContain("keeps finalized answers");
    expect(html).toContain("not the audio");
    expect(html.indexOf("Start interview")).toBeLessThan(
      html.indexOf("Check microphone"),
    );
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Start interview/u);
    expect(html).toContain('aria-label="Use text instead"');
    expect(html).toContain("Check microphone");
    expect(html).toContain("pos_absolute");
    expect(html).not.toContain("pos_fixed");

    const textButton = screen.getByRole("button", { name: "Use text instead" });
    expect(textButton.querySelector("svg")).not.toBeNull();
    expect(textButton.parentElement?.getAttribute("data-scope")).toBe(
      "tooltip",
    );
    expect(textButton.textContent.replaceAll("\u200B", "").trim()).toBe("");
  });

  test("keeps diagnostic recovery details visible without reopening the microphone", () => {
    const html = renderToStaticMarkup(
      <VoiceInterviewControlView
        {...viewProps({
          snapshot: {
            ...snapshot,
            errorCode: "microphone-permission",
            errorMessage:
              "Allow microphone access in your browser settings, then reconnect voice input.",
            errorRequestId: "voice-request-permission",
            microphoneEnabled: false,
            microphoneLevel: 0,
            partialText: "",
            phase: "recoverable-error",
          },
        })}
      />,
    );

    expect(html).toContain("We couldn’t reconnect the microphone");
    expect(html).toContain(
      "Allow microphone access in your browser settings, then reconnect voice input.",
    );
    expect(html).toContain("<summary>Technical details</summary>");
    expect(html).toContain("microphone-permission");
    expect(html).toContain("voice-request-permission");
    expect(html).toContain(">Reconnect<");
    expect(html).toContain('aria-label="Use text instead"');
    expect(html).not.toContain(">Type instead<");
  });

  test("starts in the full stage and keeps recovery visible under Strict Mode", async () => {
    const getUserMedia = stubUnavailableMicrophone();
    const openSidebar = vi.fn();

    render(
      <StrictMode>
        <StatefulVoiceInterviewHarness onOpenSidebar={openSidebar} />
      </StrictMode>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select Interview" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Start interview" }));

    expect(
      await screen.findByRole("region", { name: "Voice interview stage" }),
    ).not.toBeNull();
    expect(
      await screen.findByText(
        /Microphone off · Allow microphone access in your browser settings, then reconnect voice input\./u,
      ),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "Reconnect" })).not.toBeNull();
    expect(screen.getByText("Interview active")).not.toBeNull();
    expect(screen.getByText("Interview mode")).not.toBeNull();
    expect(screen.getByText("1 sidebar open requests")).not.toBeNull();
    expect(openSidebar).toHaveBeenCalledOnce();
    expect(getUserMedia).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Select Chat" }));
    expect(
      screen.getByRole("region", { name: "Voice interview mini bar" }),
    ).not.toBeNull();
    expect(screen.getByText("Chat mode")).not.toBeNull();
    expect(openSidebar).toHaveBeenCalledOnce();
  });

  test("uses full Interview and compact Chat presentations without ending", async () => {
    window.localStorage.setItem(
      VOICE_INTERVIEW_DISCLOSURE_STORAGE_KEY,
      "acknowledged",
    );
    const getUserMedia = stubUnavailableMicrophone();
    render(<StatefulVoiceInterviewHarness onOpenSidebar={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Select Interview" }));
    expect(
      await screen.findByRole("region", { name: "Voice interview stage" }),
    ).not.toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Minimize voice interview" }),
    );
    expect(
      screen.getByRole("region", { name: "Voice interview mini bar" }),
    ).not.toBeNull();
    expect(screen.getByText("Interview active")).not.toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: /Expand voice interview/u }),
    );
    expect(
      screen.getByRole("region", { name: "Voice interview stage" }),
    ).not.toBeNull();
    expect(screen.getByText("Interview mode")).not.toBeNull();
    expect(getUserMedia).toHaveBeenCalledOnce();
  });

  test("ends the interview and returns to Chat", async () => {
    window.localStorage.setItem(
      VOICE_INTERVIEW_DISCLOSURE_STORAGE_KEY,
      "acknowledged",
    );
    stubUnavailableMicrophone();
    render(<StatefulVoiceInterviewHarness onOpenSidebar={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Select Interview" }));
    expect(
      await screen.findByRole("region", { name: "Voice interview stage" }),
    ).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "End interview" }));

    expect(screen.getByText("Chat mode")).not.toBeNull();
    expect(screen.getByText("Interview inactive")).not.toBeNull();
    await waitFor(() => {
      expect(
        screen.queryByRole("region", { name: "Voice interview stage" }),
      ).toBeNull();
      expect(
        screen.queryByRole("region", { name: "Voice interview mini bar" }),
      ).toBeNull();
    });
  });

  test("records acknowledgement only when the interview starts", async () => {
    window.localStorage.clear();
    stubUnavailableMicrophone();
    render(<StatefulVoiceInterviewHarness onOpenSidebar={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Select Interview" }));
    fireEvent.click(screen.getByRole("button", { name: "Check microphone" }));
    expect(
      window.localStorage.getItem(VOICE_INTERVIEW_DISCLOSURE_STORAGE_KEY),
    ).toBeNull();

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Start interview" }));
    expect(
      window.localStorage.getItem(VOICE_INTERVIEW_DISCLOSURE_STORAGE_KEY),
    ).toBe("acknowledged");
  });

  test("does not record acknowledgement when choosing text instead", async () => {
    window.localStorage.clear();
    const focusComposer = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>(async () =>
        Response.json({ available: true, connectionTimeoutMs: 15_000 }),
      ),
    );
    render(
      <StatefulVoiceInterviewHarness
        onFocusComposer={focusComposer}
        onOpenSidebar={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select Interview" }));
    fireEvent.click(screen.getByRole("button", { name: "Use text instead" }));
    expect(
      window.localStorage.getItem(VOICE_INTERVIEW_DISCLOSURE_STORAGE_KEY),
    ).toBeNull();
    expect(screen.getByText("Chat mode")).not.toBeNull();
    expect(focusComposer).toHaveBeenCalledOnce();
  });

  test("uses text from an active interview without ending the session", async () => {
    window.localStorage.setItem(
      VOICE_INTERVIEW_DISCLOSURE_STORAGE_KEY,
      "acknowledged",
    );
    const focusComposer = vi.fn();
    stubUnavailableMicrophone();
    render(
      <StatefulVoiceInterviewHarness
        onFocusComposer={focusComposer}
        onOpenSidebar={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select Interview" }));
    expect(
      await screen.findByRole("region", { name: "Voice interview stage" }),
    ).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Use text instead" }));

    expect(screen.getByText("Chat mode")).not.toBeNull();
    expect(screen.getByText("Interview active")).not.toBeNull();
    expect(
      screen.getByRole("region", { name: "Voice interview mini bar" }),
    ).not.toBeNull();
    expect(focusComposer).toHaveBeenCalledOnce();
  });

  test("skips the disclosure after it has been acknowledged", async () => {
    stubUnavailableMicrophone();
    window.localStorage.setItem(
      VOICE_INTERVIEW_DISCLOSURE_STORAGE_KEY,
      "acknowledged",
    );
    render(<StatefulVoiceInterviewHarness onOpenSidebar={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Select Interview" }));

    expect(
      screen.queryByRole("region", { name: "Start voice interview" }),
    ).toBeNull();
    expect(
      await screen.findByRole("region", { name: "Voice interview stage" }),
    ).not.toBeNull();
  });

  test("keeps the question visible and names microphone level", () => {
    const html = renderToStaticMarkup(
      <VoiceInterviewControlView {...viewProps()} />,
    );

    expect(html).toContain("What happens after approval?");
    expect(html).toContain("Live transcript");
    expect(html).toContain("Listening");
    expect(html).toContain("Microphone input level: Medium");
    expect(html).toContain('aria-label="Done speaking"');
    expect(html).toContain("motionReduce:vis_hidden");
    expect(html).toContain("pos_relative");
    expect(html).not.toContain("pos_fixed");
    expect(html).toContain('aria-live="polite"');
  });

  test("centers a circular microphone and waveform without visible level copy", () => {
    render(<VoiceInterviewControlView {...viewProps()} />);

    expect(screen.getByTestId("voice-microphone-focal")).not.toBeNull();
    expect(screen.getByTestId("voice-waveform")).not.toBeNull();
    expect(screen.getByText("Listening")).not.toBeNull();

    const accessibleLevel = screen.getByText("Microphone input level: Medium");
    expect(accessibleLevel.className).toContain("pos_absolute");
    expect(
      screen.queryByText("Microphone on · Listening", {
        selector: ":not([role='status'])",
      }),
    ).toBeNull();
  });

  test("shows compact recording and sent transcript statuses", () => {
    const rendered = render(<VoiceInterviewControlView {...viewProps()} />);

    expect(screen.getByText("Live transcript")).not.toBeNull();
    expect(screen.getByText("Recording")).not.toBeNull();
    expect(screen.queryByText("What we’re hearing · Not sent yet")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Not sent yet");

    rendered.rerender(
      <VoiceInterviewControlView
        {...viewProps({
          snapshot: {
            ...snapshot,
            lastAnswerDelivery: "delivered",
            lastCommittedText: "The shift lead assigns an owner.",
            microphoneEnabled: false,
            microphoneLevel: 0,
            partialText: "",
            phase: "waiting",
          },
        })}
      />,
    );

    expect(screen.getByText("Your answer")).not.toBeNull();
    expect(screen.getByText("Sent")).not.toBeNull();
    expect(screen.getByText("The shift lead assigns an owner.")).not.toBeNull();
  });

  test("shows a sending status while the answer is still being delivered", () => {
    render(
      <VoiceInterviewControlView
        {...viewProps({
          snapshot: {
            ...snapshot,
            lastAnswerDelivery: "pending",
            lastCommittedText: "The shift lead assigns an owner.",
            microphoneEnabled: false,
            microphoneLevel: 0,
            partialText: "",
            phase: "delivering",
          },
        })}
      />,
    );

    expect(screen.getByText("Your answer")).not.toBeNull();
    expect(screen.getByText("Sending")).not.toBeNull();
    expect(screen.queryByText("Sent")).toBeNull();
  });

  test("shows a not-sent status when delivery failed", () => {
    render(
      <VoiceInterviewControlView
        {...viewProps({
          snapshot: {
            ...snapshot,
            errorCode: null,
            errorMessage:
              "The interview could not accept that answer. Use the composer to retry.",
            lastAnswerDelivery: "failed",
            lastCommittedText: "The shift lead assigns an owner.",
            microphoneEnabled: false,
            microphoneLevel: 0,
            partialText: "",
            phase: "recoverable-error",
          },
        })}
      />,
    );

    expect(screen.getByText("Not sent")).not.toBeNull();
    expect(screen.queryByText("Sent")).toBeNull();
    expect(screen.getByText("The shift lead assigns an owner.")).not.toBeNull();
  });

  test("uses voice-app icon controls while listening", () => {
    render(<VoiceInterviewControlView {...viewProps()} />);

    for (const name of ["Use text instead", "Done speaking", "Pause"]) {
      const button = screen.getByRole("button", { name });
      expect(button.querySelector("svg")).not.toBeNull();
      expect(button.parentElement?.getAttribute("data-scope")).toBe("tooltip");
    }

    expect(
      screen
        .getByRole("button", { name: "Done speaking" })
        .textContent.replaceAll("\u200B", "")
        .trim(),
    ).toBe("");
  });

  test("orders the full listening actions as keyboard, done speaking, then pause", () => {
    const html = renderToStaticMarkup(
      <VoiceInterviewControlView {...viewProps()} />,
    );

    expect(html.indexOf('aria-label="Use text instead"')).toBeLessThan(
      html.indexOf('aria-label="Done speaking"'),
    );
    expect(html.indexOf('aria-label="Done speaking"')).toBeLessThan(
      html.indexOf('aria-label="Pause"'),
    );
  });

  test("offers only resume and keyboard actions while paused", () => {
    render(
      <VoiceInterviewControlView
        {...viewProps({
          snapshot: {
            ...snapshot,
            microphoneEnabled: false,
            microphoneLevel: 0,
            partialText: "",
            phase: "paused",
          },
        })}
      />,
    );

    expect(screen.getByText("Paused")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Resume listening" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Use text instead" }),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Done speaking" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Interrupt and speak" }),
    ).toBeNull();
  });

  test("shows the waveform only while the microphone is listening", () => {
    const rendered = render(<VoiceInterviewControlView {...viewProps()} />);

    expect(screen.getByTestId("voice-waveform")).not.toBeNull();

    for (const phase of ["paused", "playing", "waiting"] as const) {
      rendered.rerender(
        <VoiceInterviewControlView
          {...viewProps({
            snapshot: {
              ...snapshot,
              microphoneEnabled: false,
              microphoneLevel: 0,
              partialText: "",
              phase,
            },
          })}
        />,
      );
      expect(screen.queryByTestId("voice-waveform")).toBeNull();
      expect(screen.queryByText(/Microphone input level:/u)).toBeNull();
    }
  });

  test("keeps reconnect visible and makes secondary recovery icon-only", () => {
    render(
      <VoiceInterviewControlView
        {...viewProps({
          snapshot: {
            ...snapshot,
            errorCode: "microphone-permission",
            errorMessage:
              "Allow microphone access in your browser settings, then reconnect voice input.",
            errorRequestId: "voice-request-permission",
            microphoneEnabled: false,
            microphoneLevel: 0,
            partialText: "",
            phase: "recoverable-error",
          },
        })}
      />,
    );

    expect(
      screen.getByText("We couldn’t reconnect the microphone"),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Reconnect" }).textContent,
    ).toContain("Reconnect");
    expect(
      screen
        .getByRole("button", { name: "Use text instead" })
        .querySelector("svg"),
    ).not.toBeNull();
    expect(screen.getByText("Technical details")).not.toBeNull();
  });

  test("names the recovery problem for each error family", () => {
    const recovery = (
      errorCode: VoiceTurnSnapshot["errorCode"],
      errorMessage: string,
    ) => (
      <VoiceInterviewControlView
        {...viewProps({
          snapshot: {
            ...snapshot,
            errorCode,
            errorMessage,
            microphoneEnabled: false,
            microphoneLevel: 0,
            partialText: "",
            phase: "recoverable-error",
          },
        })}
      />
    );

    const rendered = render(
      recovery(
        "microphone-device",
        "Connect or select a microphone, then reconnect voice input.",
      ),
    );
    expect(
      screen.getByText("We couldn’t reconnect the microphone"),
    ).not.toBeNull();
    expect(screen.getByText("Microphone unavailable")).not.toBeNull();
    expect(
      screen.getByText(
        "Connect or select a microphone, then reconnect voice input.",
      ),
    ).not.toBeNull();

    rendered.rerender(
      recovery(
        "timeout",
        "The voice connection timed out. Check your connection, then reconnect voice input.",
      ),
    );
    expect(screen.getByText("We lost the voice connection")).not.toBeNull();
    expect(screen.getByText("Connection paused")).not.toBeNull();

    rendered.rerender(
      recovery(
        "invalid-response",
        "The interview could not accept that answer. Use the composer to retry.",
      ),
    );
    expect(screen.getByText("The interview couldn’t continue")).not.toBeNull();
    expect(screen.getByText("Interview paused")).not.toBeNull();

    rendered.rerender(
      recovery(
        null,
        "The interview could not accept that answer. Use the composer to retry.",
      ),
    );
    expect(screen.getByText("The interview couldn’t continue")).not.toBeNull();
    expect(screen.getByText("Interview paused")).not.toBeNull();
    expect(
      screen.queryByText("We couldn’t reconnect the microphone"),
    ).toBeNull();
  });

  test("renders icons for the listening controls", () => {
    render(<VoiceInterviewControlView {...viewProps()} />);

    for (const name of [
      "Minimize voice interview",
      "End interview",
      "Done speaking",
      "Pause",
    ]) {
      expect(
        screen.getByRole("button", { name }).querySelector("svg"),
      ).not.toBeNull();
    }
  });

  test("does not describe an unavailable meter while the microphone is off", () => {
    const waitingHtml = renderToStaticMarkup(
      <VoiceInterviewControlView
        {...viewProps({
          snapshot: {
            ...snapshot,
            microphoneEnabled: false,
            microphoneLevel: 0,
            partialText: "",
            phase: "waiting",
          },
        })}
      />,
    );

    expect(waitingHtml).not.toContain(
      "Microphone input level unavailable while microphone is off",
    );
  });

  test("renders committed repair actions separately from pause, minimize, and end", () => {
    const html = renderToStaticMarkup(
      <VoiceInterviewControlView
        {...viewProps({
          snapshot: {
            ...snapshot,
            lastCommittedText: "The shift lead approves it.",
            microphoneEnabled: false,
            microphoneLevel: 0,
            partialText: "",
            phase: "waiting",
          },
        })}
      />,
    );

    for (const name of [
      "Minimize voice interview",
      "End interview",
      "Redo answer",
      "Edit text",
      "Use text instead",
    ]) {
      expect(html).toContain(name);
    }
  });

  test("enables repair actions only while the last answer can be revised", () => {
    const rendered = render(
      <VoiceInterviewControlView
        {...viewProps({
          snapshot: {
            ...snapshot,
            canReviseLastAnswer: false,
            lastCommittedText: "The shift lead approves it.",
            microphoneEnabled: false,
            microphoneLevel: 0,
            partialText: "",
            phase: "waiting",
          },
        })}
      />,
    );

    expect(
      screen
        .getByRole("button", { name: "Redo answer" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Edit text" })
        .hasAttribute("disabled"),
    ).toBe(true);

    rendered.rerender(
      <VoiceInterviewControlView
        {...viewProps({
          snapshot: {
            ...snapshot,
            canReviseLastAnswer: true,
            lastCommittedText: "The shift lead approves it.",
            partialText: "",
          },
        })}
      />,
    );

    expect(
      screen
        .getByRole("button", { name: "Redo answer" })
        .hasAttribute("disabled"),
    ).toBe(false);
    expect(
      screen
        .getByRole("button", { name: "Edit text" })
        .hasAttribute("disabled"),
    ).toBe(false);
  });

  test("offers deterministic interrupt instead of listening during playback", () => {
    const html = renderToStaticMarkup(
      <VoiceInterviewControlView
        {...viewProps({
          snapshot: {
            ...snapshot,
            microphoneEnabled: false,
            microphoneLevel: 0,
            partialText: "",
            phase: "playing",
          },
        })}
      />,
    );

    expect(html).toContain("Microphone off · Interviewer speaking");
    expect(html).toContain('aria-label="Interrupt and speak"');
    expect(html).not.toContain(">Pause<");
  });

  test("uses a detached bottom mini bar with independent expand, type, pause, and end controls", () => {
    render(
      <VoiceInterviewControlView
        {...viewProps({ placement: "detached", presentation: "mini" })}
      />,
    );

    expect(
      screen.getByRole("region", { name: "Voice interview mini bar" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", {
        name: "Expand voice interview. Microphone on · Listening. Question: What happens after approval?",
      }),
    ).not.toBeNull();
    expect(screen.getByText("Listening")).not.toBeNull();
    expect(screen.queryByText("Microphone on · Listening")).toBeNull();
    expect(screen.getByText("What happens after approval?")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Done speaking" }),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "Pause" })).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Use text instead" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "End interview" }),
    ).not.toBeNull();

    for (const name of [
      "Done speaking",
      "Pause",
      "Use text instead",
      "End interview",
    ]) {
      const button = screen.getByRole("button", { name });
      expect(button.querySelector("svg")).not.toBeNull();
      expect(button.parentElement?.getAttribute("data-scope")).toBe("tooltip");
    }

    const html = renderToStaticMarkup(
      <VoiceInterviewControlView
        {...viewProps({ placement: "detached", presentation: "mini" })}
      />,
    );
    expect(html).toContain("--voice-interview-right");
    expect(html).toContain("[@media_(min-width:_768px)]");
    expect(html).not.toContain("md:right_4");
  });

  test("shows only the valid compact phase action", () => {
    const rendered = render(
      <VoiceInterviewControlView
        {...viewProps({
          snapshot: { ...snapshot, microphoneEnabled: false, phase: "paused" },
          presentation: "mini",
        })}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Resume listening" }),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Done speaking" })).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Resume listening" })
        .querySelector("svg"),
    ).not.toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Resume listening" })
        .parentElement?.getAttribute("data-scope"),
    ).toBe("tooltip");

    rendered.rerender(
      <VoiceInterviewControlView
        {...viewProps({
          snapshot: { ...snapshot, microphoneEnabled: false, phase: "playing" },
          presentation: "mini",
        })}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Interrupt and speak" }),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Interrupt and speak" })
        .querySelector("svg"),
    ).not.toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Interrupt and speak" })
        .parentElement?.getAttribute("data-scope"),
    ).toBe("tooltip");
  });

  test("announces compact question and provisional transcript context", () => {
    render(
      <VoiceInterviewControlView
        {...viewProps({ placement: "detached", presentation: "mini" })}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Expand voice interview. Microphone on · Listening. Question: What happens after approval?",
      }),
    ).not.toBeNull();
    expect(screen.getByRole("status").textContent).toBe(
      "Microphone on · Listening. Question: What happens after approval? Not sent yet: The request goes to",
    );
  });

  test("shows authoritative covered and still-exploring facts without a question count", () => {
    const html = renderToStaticMarkup(
      <VoiceInterviewControlView
        {...viewProps({
          coverage: {
            complete: false,
            covered: ["dispatch"],
            stillExploring: ["approval — how long it takes"],
          },
        })}
      />,
    );

    expect(html).toContain("Covered");
    expect(html).toContain("Still exploring");
    expect(html).not.toMatch(/\d+ of \d+/u);
  });

  test("keeps interview coverage as a low-emphasis details row", () => {
    const html = renderToStaticMarkup(
      <VoiceInterviewControlView
        {...viewProps({
          coverage: {
            complete: false,
            covered: ["dispatch"],
            stillExploring: ["approval — how long it takes"],
          },
        })}
      />,
    );

    expect(html).toMatch(/<details class="[^"]*fs_xs/u);
  });
});

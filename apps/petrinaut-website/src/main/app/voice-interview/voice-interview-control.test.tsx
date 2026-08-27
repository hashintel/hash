/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  loadOpenAIVoiceConfig,
  VoiceInterviewControl,
  VoiceInterviewControlView,
  type VoiceInterviewControlViewProps,
} from "./voice-interview-control";

import type { PetrinautAiInterviewStageContext } from "@hashintel/petrinaut/ui";

const snapshot = {
  canReviseLastAnswer: false,
  currentQuestion: "What happens after approval?",
  errorCode: null,
  errorMessage: "",
  errorRequestId: "",
  lastCommittedText: "",
  microphoneEnabled: true,
  microphoneLevel: 0.24,
  partialText: "The request goes to",
  phase: "listening" as const,
};

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
  onShowStart: vi.fn(),
  onStart: vi.fn(),
  onSubmitCorrection: vi.fn(),
  onTypeInstead: vi.fn(),
  placement: "sidebar",
  presentation: "full",
  snapshot,
  ...overrides,
});

const StatefulVoiceInterviewHarness = ({
  onOpenSidebar,
}: {
  onOpenSidebar: () => void;
}) => {
  "use no memo";

  const [active, setActive] = useState(false);
  const [sidebarOpenRequests, setSidebarOpenRequests] = useState(0);
  const context: PetrinautAiInterviewStageContext = {
    canAcceptInterviewAnswer: true,
    conversationId: "interview-test",
    focusComposer: vi.fn(),
    messages: [],
    openSidebar: () => {
      onOpenSidebar();
      setSidebarOpenRequests((requests) => requests + 1);
    },
    placement: "sidebar",
    setActive,
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
      <output>{active ? "Interview active" : "Interview inactive"}</output>
      <output>{sidebarOpenRequests} sidebar open requests</output>
      <VoiceInterviewControl {...context} />
    </>
  );
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("voice interview stage", () => {
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

    expect(html).toContain("sent to OpenAI for transcription");
    expect(html).toContain("does not retain the audio");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Start interview/u);
    expect(html).toContain("Use text instead");
    expect(html).toContain("Check microphone");
    expect(html).toContain("pos_absolute");
    expect(html).not.toContain("pos_fixed");
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

    expect(html).toContain(
      "Microphone off · Allow microphone access in your browser settings, then reconnect voice input.",
    );
    expect(html).toContain("Error code: microphone-permission.");
    expect(html).toContain("Diagnostic reference: voice-request-permission.");
    expect(html).toContain(">Reconnect<");
  });

  test("starts in the full stage and keeps recovery visible under Strict Mode", async () => {
    const getUserMedia = vi.fn(async () => {
      throw new DOMException("Permission denied", "NotAllowedError");
    });
    const openSidebar = vi.fn();
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

    render(
      <StrictMode>
        <StatefulVoiceInterviewHarness onOpenSidebar={openSidebar} />
      </StrictMode>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Start voice interview" }),
    );
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Start interview" }));

    expect(
      await screen.findByRole("region", { name: "Voice interview stage" }),
    ).not.toBeNull();
    expect(
      await screen.findAllByText(
        /Microphone off · Allow microphone access in your browser settings, then reconnect voice input\. Error code: microphone-permission\./u,
      ),
    ).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Reconnect" })).not.toBeNull();
    expect(screen.getByText("Interview active")).not.toBeNull();
    expect(screen.getByText("1 sidebar open requests")).not.toBeNull();
    expect(openSidebar).toHaveBeenCalledOnce();
  });

  test("keeps the question visible, distinguishes provisional text, and names microphone level", () => {
    const html = renderToStaticMarkup(
      <VoiceInterviewControlView {...viewProps()} />,
    );

    expect(html).toContain("What happens after approval?");
    expect(html).toContain("What we’re hearing · Not sent yet");
    expect(html).toContain("Microphone on · Listening");
    expect(html).toContain("Microphone input level: Medium");
    expect(html).toContain("Done speaking");
    expect(html).toContain("motionReduce:vis_hidden");
    expect(html).toContain("pos_relative");
    expect(html).not.toContain("pos_fixed");
    expect(html).toContain('aria-live="polite"');
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
      "Minimize",
      "End interview",
      "Redo answer",
      "Edit text",
      "Type instead",
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
    expect(html).toContain("Interrupt and speak");
    expect(html).not.toContain(">Pause<");
  });

  test("uses a detached bottom mini bar with independent expand, type, pause, and end controls", () => {
    const html = renderToStaticMarkup(
      <VoiceInterviewControlView
        {...viewProps({ placement: "detached", presentation: "mini" })}
      />,
    );

    expect(html).toContain('aria-label="Voice interview mini bar"');
    expect(html).toContain(
      'aria-label="Expand voice interview. Microphone on · Listening"',
    );
    expect(html).toContain("Microphone on · Listening");
    expect(html).toContain("--voice-interview-right");
    expect(html).toContain("[@media_(min-width:_768px)]");
    expect(html).not.toContain("md:right_4");
    expect(html).toContain('aria-label="Type an interview answer"');
    expect(html).toContain(">Pause<");
    expect(html).toContain('aria-label="End interview"');
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
});

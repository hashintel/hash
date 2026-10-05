import {
  type ComponentProps,
  type ReactNode,
  use,
  useEffect,
  useState,
} from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { NotificationsProvider } from "../../../../../react/notifications/provider";
import { EditorContext } from "../../../../../react/state/editor-context";
import { VoiceSessionContext } from "../../../../../react/voice-session/context";
import {
  createVoiceSessionStore,
  type VoiceSessionActions,
  type VoiceSessionStore,
} from "../../../../../react/voice-session/store";
import { AiAssistantContents } from "./ai-assistant-contents";
import { REVIEW_CHIPS } from "./ai-assistant-contents/prompt-chips";

import type { VoiceAudioSettingsState } from "../../../../../react/voice-session/types";
import type {
  PetrinautAiAssistantPresentation,
  PetrinautAiToolPresentationResolver,
} from "../../../../petrinaut";
import type { PetrinautAiVoiceSessionState } from "../../../../types/ai-assistant-composer-control";
import type { PetrinautAiMessage } from "./types";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Editor / AI Assistant",
  decorators: [
    (Story) => (
      <NotificationsProvider>
        <Story />
      </NotificationsProvider>
    ),
  ],
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const userMessage: PetrinautAiMessage = {
  id: "user-1",
  role: "user",
  parts: [
    {
      type: "text",
      text: "Create a pharmaceutical supply chain Petri net.",
    },
  ],
};

const followUpUserMessage: PetrinautAiMessage = {
  id: "user-2",
  role: "user",
  parts: [
    {
      type: "text",
      text: "Turn this into an SIR model petri net please.",
    },
  ],
};

const assistantMarkdownMessage: PetrinautAiMessage = {
  id: "assistant-1",
  role: "assistant",
  parts: [
    {
      type: "text",
      state: "done",
      text: "I created a **supply intake** structure with:\n\n- stochastic supply places\n- a delivery transition\n- a manufacturing buffer",
    },
  ],
};

const reasoningMessage: PetrinautAiMessage = {
  id: "assistant-reasoning",
  role: "assistant",
  parts: [
    {
      type: "reasoning",
      state: "done",
      text: "Identify diagram type: Petri net\n\n- Extract required places and transitions\n- Keep IDs stable\n- Add positions for immediate visual feedback",
    },
    {
      type: "text",
      state: "done",
      text: "I understand the requested model and will update the net directly.",
    },
  ],
};

const streamingReasoningMessage: PetrinautAiMessage = {
  id: "assistant-streaming-reasoning",
  role: "assistant",
  parts: [
    {
      type: "reasoning",
      state: "streaming",
      text: "I need to identify the SIR compartments and map movement between susceptible, infected, and recovered places.",
    },
  ],
};

const singleToolCallMessage: PetrinautAiMessage = {
  id: "assistant-single-tool",
  role: "assistant",
  parts: [
    {
      type: "tool-updatePlacePosition",
      state: "output-available",
      toolCallId: "tool-position",
      input: {
        placeId: "place__plant_supply",
        position: { x: 80, y: 40 },
      },
      output: {
        applied: true,
        title: "Moved place Plant Supply",
        target: {
          kind: "selection",
          item: { type: "place", id: "place__plant_supply" },
        },
      },
    },
  ],
};

const toolCallMessage: PetrinautAiMessage = {
  id: "assistant-tools",
  role: "assistant",
  parts: [
    {
      type: "tool-addPlace",
      state: "output-available",
      toolCallId: "tool-1",
      input: {
        id: "place__plant_supply",
        name: "Plant Supply",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        showAsInitialState: true,
        x: 0,
        y: 0,
      },
      output: {
        applied: true,
        title: "Added place Plant Supply",
        target: {
          kind: "selection",
          item: { type: "place", id: "place__plant_supply" },
        },
      },
    },
    {
      type: "tool-addTransition",
      state: "output-available",
      toolCallId: "tool-2",
      input: {
        id: "transition__delivery",
        name: "Delivery",
        inputArcs: [],
        outputArcs: [],
        lambdaType: "predicate",
        lambdaCode: "export const Lambda = () => true;",
        transitionKernelCode: "export const TransitionKernel = () => ({});",
        x: 160,
        y: 0,
      },
      output: {
        applied: true,
        title: "Added transition Delivery",
        target: {
          kind: "selection",
          item: { type: "transition", id: "transition__delivery" },
        },
      },
    },
  ],
};

const renamedToolCallMessage: PetrinautAiMessage = {
  id: "assistant-renamed-tool",
  role: "assistant",
  parts: [
    {
      type: "tool-updatePlace",
      state: "output-available",
      toolCallId: "tool-rename",
      input: {
        placeId: "place__plant_supply",
        update: {
          name: "Warehouse Supply",
        },
      },
      output: {
        applied: true,
        title: "Updated place Warehouse Supply",
        detail: "Previous name: Plant Supply",
        target: {
          kind: "selection",
          item: { type: "place", id: "place__plant_supply" },
        },
      },
    },
  ],
};

const errorMessage = new Error(
  "The assistant could not reach the AI endpoint.",
);

const hostSlotStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "2",
  paddingX: "3",
  paddingY: "3",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a20",
  borderRadius: "xl",
  backgroundColor: "neutral.s20",
  color: "neutral.s100",
  fontSize: "sm",
  lineHeight: "relaxed",
});

const hostSlotTitleStyle = css({
  fontSize: "sm",
  fontWeight: "semibold",
});

const frameStyle = css({
  containerType: "inline-size",
  height: "[720px]",
  position: "relative",
  width: "full",
});

const narrowFrameStyle = css({
  containerType: "inline-size",
  height: "[720px]",
  maxWidth: "full",
  position: "relative",
  width: "[390px]",
  "& > aside": {
    maxWidth: "[calc(100% - 32px)]",
  },
});

/**
 * Stands in for a host's pre-session slot. Once a session is running the host
 * reports state instead of rendering, and Petrinaut's own dock takes over.
 */
const HostVoiceSlotPreview = () => (
  <section aria-label="Voice mode consent" className={hostSlotStyle}>
    <span className={hostSlotTitleStyle}>Voice mode</span>
    <span>
      OpenAI processes live audio to speak the interviewer's questions.
      Petrinaut keeps finalized answers in the conversation rather than the
      audio.
    </span>
    <Button size="xs" type="button" variant="solid">
      Start voice mode
    </Button>
  </section>
);

type VoiceProvider = "live" | "realtime";

const updateVoiceSessionState = (
  store: VoiceSessionStore,
  update: Partial<PetrinautAiVoiceSessionState>,
) => {
  const current = store.getSnapshot().state;
  if (current) {
    store.setState({ ...current, ...update });
  }
};

const createStoryVoiceSessionStore = (
  provider: VoiceProvider,
  state?: PetrinautAiVoiceSessionState,
): VoiceSessionStore => {
  const store = createVoiceSessionStore();
  if (!state) {
    return store;
  }

  const speakerActions = {
    setSpeakerMuted: (speakerMuted: boolean) =>
      updateVoiceSessionState(store, { speakerMuted }),
    setSpeakerVolume: (speakerVolume: number) =>
      updateVoiceSessionState(store, {
        speakerVolume: Math.min(1, Math.max(0, speakerVolume)),
      }),
  };
  const updateAudioSettings = (
    update: (settings: VoiceAudioSettingsState) => VoiceAudioSettingsState,
  ) => {
    const audioSettings = store.getSnapshot().state?.audioSettings;
    if (audioSettings) {
      updateVoiceSessionState(store, {
        audioSettings: update(audioSettings),
      });
    }
  };
  const audioSettingsActions = state.audioSettings
    ? {
        refreshDevices: () => {},
        requestSpeaker: () => {},
        setMicrophoneDevice: (microphoneId: string) =>
          updateAudioSettings((settings) => ({
            ...settings,
            devices: { ...settings.devices, microphoneId },
          })),
        setSpeakerDevice: (speakerId: string) =>
          updateAudioSettings((settings) => ({
            ...settings,
            devices: { ...settings.devices, speakerId },
          })),
        setSpeed: (speed: number) =>
          updateAudioSettings((settings) => ({ ...settings, speed })),
        setVoice: (voice: string) =>
          updateAudioSettings((settings) => ({ ...settings, voice })),
      }
    : undefined;
  const liveActions: VoiceSessionActions = {
    audioSettings: audioSettingsActions,
    end: () => {},
    pause: () => {},
    setMicrophoneMuted: (microphoneMuted) =>
      updateVoiceSessionState(store, { microphoneMuted }),
    ...speakerActions,
  };

  store.setActions(
    provider === "live"
      ? liveActions
      : {
          ...liveActions,
          readFullResponse: () => {},
          reconnect: () => {},
          repeatQuestion: () => {},
          resume: () => {},
          setInterruptionBySpeaking: (interruptionBySpeaking) =>
            updateVoiceSessionState(store, { interruptionBySpeaking }),
          takeTurn: () => {},
        },
  );
  store.setState(state);

  return store;
};

const Frame = ({
  extraTabs,
  composerControl,
  error,
  experimentStates,
  onCancelExperiment,
  fixedNarrowWidth = false,
  initialPlacement = "docked",
  initialVoiceDockCollapsed = false,
  inputMode = "text",
  messages,
  primaryLabel,
  presentation,
  promptChips,
  resolveToolPresentation,
  status = "ready",
  stopped = false,
  voiceMode,
  voiceModeAvailable = false,
  voiceProvider = "live",
  voiceSession,
  workingLabel,
}: {
  extraTabs?: ComponentProps<typeof AiAssistantContents>["extraTabs"];
  composerControl?: ComponentProps<
    typeof AiAssistantContents
  >["composerControl"];
  error?: Error;
  experimentStates?: ComponentProps<
    typeof AiAssistantContents
  >["experimentStates"];
  onCancelExperiment?: (toolCallId: string) => void;
  fixedNarrowWidth?: boolean;
  initialPlacement?: "docked" | "floating";
  initialVoiceDockCollapsed?: boolean;
  inputMode?: "text" | "voice";
  messages: PetrinautAiMessage[];
  primaryLabel?: string;
  presentation?: PetrinautAiAssistantPresentation;
  promptChips?: ComponentProps<typeof AiAssistantContents>["promptChips"];
  resolveToolPresentation?: PetrinautAiToolPresentationResolver;
  status?: "submitted" | "streaming" | "ready" | "error";
  stopped?: boolean;
  voiceMode?: ReactNode;
  voiceModeAvailable?: boolean;
  voiceProvider?: VoiceProvider;
  voiceSession?: PetrinautAiVoiceSessionState;
  workingLabel?: string;
}) => {
  const editor = use(EditorContext);
  const [placement, setPlacement] = useState(initialPlacement);
  const [width, setWidth] = useState(editor.aiAssistantWidth);
  const [isOpen, setOpen] = useState(true);
  const [input, setInput] = useState("");
  const [voiceDockCollapsed, setVoiceDockCollapsed] = useState(
    initialVoiceDockCollapsed,
  );
  // Stands in for the host, which reports session state rather than rendering
  // the live surfaces itself.
  const [voiceSessionStore] = useState(() =>
    createStoryVoiceSessionStore(voiceProvider, voiceSession),
  );

  return (
    <EditorContext
      value={{
        ...editor,
        aiAssistantPlacement: placement,
        setAiAssistantPlacement: setPlacement,
        aiAssistantWidth: width,
        setAiAssistantWidth: setWidth,
      }}
    >
      <VoiceSessionContext.Provider value={voiceSessionStore}>
        <div
          className={fixedNarrowWidth ? narrowFrameStyle : frameStyle}
          data-testid="ai-assistant-story-frame"
        >
          <AiAssistantContents
            extraTabs={extraTabs}
            composerControl={composerControl}
            error={error}
            experimentStates={experimentStates}
            onCancelExperiment={onCancelExperiment}
            input={input}
            inputMode={inputMode}
            messages={messages}
            isOpen={isOpen}
            primaryLabel={primaryLabel}
            presentation={presentation}
            promptChips={promptChips}
            onSendPrompt={setInput}
            onRetryPrompt={fn()}
            onClose={() => setOpen(false)}
            onInputChange={setInput}
            onInputModeChange={() => {}}
            onStop={() => {}}
            onSubmit={() => setInput("")}
            onVoiceDockCollapsedChange={setVoiceDockCollapsed}
            resolveToolPresentation={resolveToolPresentation}
            status={status}
            stopped={stopped}
            voiceDockCollapsed={voiceDockCollapsed}
            voiceMode={voiceMode}
            voiceModeAvailable={voiceModeAvailable}
            workingLabel={workingLabel}
          />
        </div>
      </VoiceSessionContext.Provider>
    </EditorContext>
  );
};

const liveSession = (
  overrides: Partial<PetrinautAiVoiceSessionState>,
): PetrinautAiVoiceSessionState => ({
  errorMessage: null,
  microphoneLevel: 0,
  microphoneMuted: false,
  phase: "listening",
  ...overrides,
});

export const Empty: Story = {
  render: () => <Frame messages={[]} promptChips={REVIEW_CHIPS} />,
};

export const Floating: Story = {
  render: () => (
    <Frame
      initialPlacement="floating"
      messages={[userMessage, assistantMarkdownMessage]}
    />
  ),
};

export const WithWorkpieceTab: Story = {
  render: () => (
    <Frame
      extraTabs={[
        {
          id: "workpiece",
          label: "Workpiece",
          content: (
            <div>
              <h2>Model account</h2>
              <p>A saved description of the process being modeled.</p>
            </div>
          ),
        },
      ]}
      messages={[userMessage, assistantMarkdownMessage]}
    />
  ),
};

export const EmptyWithVoiceAvailable: Story = {
  render: () => <Frame messages={[]} voiceModeAvailable />,
};

export const BrunchWithVoiceAvailable: Story = {
  render: () => (
    <Frame
      primaryLabel="Chat"
      presentation="brunch"
      messages={[]}
      voiceModeAvailable
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByRole("textbox", {
      name: "Message AI assistant",
    });
    const voice = canvas.getByRole("button", { name: "Start voice mode" });
    await expect(voice.getBoundingClientRect().top).toBeLessThan(
      textarea.getBoundingClientRect().bottom,
    );
    await userEvent.type(textarea, "Create a queue");
    const send = canvas.getByRole("button", { name: "Send message" });
    await expect(send.getBoundingClientRect().top).toBeLessThan(
      textarea.getBoundingClientRect().bottom,
    );
    await userEvent.clear(textarea);
  },
};

export const VoiceModeAwaitingConsent: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceMode={<HostVoiceSlotPreview />}
      voiceModeAvailable
    />
  ),
};

export const VoiceModeAwaitingConsentCompact: Story = {
  render: () => (
    <Frame
      initialVoiceDockCollapsed
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceMode={<HostVoiceSlotPreview />}
      voiceModeAvailable
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const consent = canvas.getByTestId("ai-voice-mode");
    const dock = canvas.getByRole("region", { name: "Voice setup" });
    const shell = dock.closest("aside")!;
    const initialShellHeight = shell.getBoundingClientRect().height;
    const initialDockTop = dock.getBoundingClientRect().top;
    await expect(initialShellHeight).toBe(dock.getBoundingClientRect().height);
    await expect(shell.getBoundingClientRect().bottom).toBe(
      canvas.getByTestId("ai-assistant-story-frame").getBoundingClientRect()
        .bottom - 12,
    );

    // Host content can grow or disappear; neither should move the controls
    // whose position is derived from the compact shell's reported height.
    consent.style.minHeight = "320px";
    await expect(shell.getBoundingClientRect().height).toBe(initialShellHeight);
    await expect(dock.getBoundingClientRect().top).toBe(initialDockTop);
    consent.style.display = "none";
    await expect(shell.getBoundingClientRect().height).toBe(initialShellHeight);
    consent.style.removeProperty("min-height");
    consent.style.removeProperty("display");
  },
};

export const FloatingVoiceModeAwaitingConsentCompact: Story = {
  render: () => (
    <Frame
      initialPlacement="floating"
      initialVoiceDockCollapsed
      inputMode="voice"
      messages={[]}
      voiceMode={<HostVoiceSlotPreview />}
      voiceModeAvailable
    />
  ),
  play: VoiceModeAwaitingConsentCompact.play,
};

export const VoiceSessionListening: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceModeAvailable
      voiceSession={liveSession({
        microphoneLevel: 0.6,
      })}
    />
  ),
};

export const LiveSessionAudioOptions: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceModeAvailable
      voiceProvider="live"
      voiceSession={liveSession({
        microphoneLevel: 0.35,
        speakerVolume: 0.65,
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dock = canvas.getByRole("region", { name: "Voice session" });
    const microphone = within(dock).getByRole("button", {
      name: "Mute microphone",
    });

    await expect(microphone).toBeInTheDocument();
    await expect(
      microphone.closest('[data-scope="popover"][data-part="content"]'),
    ).toBeNull();
    const audioOptions = within(dock).getByRole("button", {
      name: "Audio options",
    });
    audioOptions.focus();
    await expect(audioOptions).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    const speakerMute = await canvas.findByRole("button", {
      name: "Mute speaker",
    });
    await waitFor(() => expect(speakerMute).toHaveFocus());
    await expect(speakerMute.querySelector("svg")).not.toBeNull();
    await expect(within(speakerMute).queryByText("Mute speaker")).toBeNull();
    await expect(
      canvas.getByRole("slider", { name: "Speaker volume" }),
    ).toHaveAttribute("aria-valuenow", "65");
    await expect(canvas.getByText("65%")).toBeInTheDocument();
    await expect(canvas.queryByText("Audio options")).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Close" })).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Repeat question" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Read full reply" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("checkbox", { name: "Allow interruptions" }),
    ).toBeNull();
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        canvas.queryByRole("slider", { name: "Speaker volume" }),
      ).toBeNull(),
    );
    await expect(audioOptions).toHaveFocus();
  },
};

export const RealtimeSessionAudioOptions: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceModeAvailable
      voiceProvider="realtime"
      voiceSession={liveSession({
        canReadFullResponse: true,
        canRepeatQuestion: true,
        canTakeTurn: true,
        interruptionBySpeaking: true,
        phase: "speaking",
        speakerVolume: 0.4,
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dock = canvas.getByRole("region", { name: "Voice session" });

    const audioOptions = within(dock).getByRole("button", {
      name: "Audio options",
    });
    await userEvent.click(audioOptions);

    await expect(
      await canvas.findByRole("button", { name: "Mute speaker" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("slider", { name: "Speaker volume" }),
    ).toHaveAttribute("aria-valuenow", "40");
    await expect(canvas.getByText("40%")).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Repeat question" }),
    ).toBeEnabled();
    await expect(
      canvas.getByRole("button", { name: "Read full reply" }),
    ).toBeEnabled();
    await expect(
      canvas.getByRole("checkbox", { name: "Allow interruptions" }),
    ).toBeChecked();
  },
};

const realisticAudioSettings = (
  overrides: Partial<VoiceAudioSettingsState> = {},
): VoiceAudioSettingsState => ({
  activeVoice: "alloy",
  voice: "verse",
  voices: [
    { value: "alloy", text: "Alloy" },
    { value: "verse", text: "Verse" },
    { value: "coral", text: "Coral" },
  ],
  speed: 1.25,
  devices: {
    microphones: [
      { value: "studio-mic", text: "Studio USB microphone" },
      { value: "laptop-mic", text: "Built-in microphone" },
    ],
    speakers: [
      { value: "headphones", text: "USB headphones" },
      { value: "display", text: "Studio display" },
    ],
    microphoneId: "studio-mic",
    speakerId: "headphones",
    canSelectSpeaker: true,
    canRequestSpeaker: true,
    busy: false,
    message: null,
  },
  ...overrides,
});

export const VoicePreviewPlaying: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceModeAvailable
      voiceProvider="realtime"
      voiceSession={liveSession({
        audioSettings: realisticAudioSettings({ voicePreview: "playing" }),
        microphoneMuted: true,
        phase: "muted",
        speakerVolume: 0.65,
      })}
    />
  ),
};

export const VoicePreviewLoading: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceModeAvailable
      voiceProvider="realtime"
      voiceSession={liveSession({
        audioSettings: realisticAudioSettings({ voicePreview: "loading" }),
        microphoneMuted: true,
        phase: "muted",
        speakerVolume: 0.65,
      })}
    />
  ),
};

export const VoicePreviewUnavailable: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceModeAvailable
      voiceProvider="realtime"
      voiceSession={liveSession({
        audioSettings: realisticAudioSettings({
          voicePreviewError:
            "Preview unavailable. Select a voice to try again.",
        }),
        microphoneMuted: true,
        phase: "muted",
        speakerVolume: 0.65,
      })}
    />
  ),
};

export const ExtendedAudioSettings: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceModeAvailable
      voiceProvider="realtime"
      voiceSession={liveSession({
        audioSettings: realisticAudioSettings(),
        phase: "speaking",
        speakerVolume: 0.65,
        warningMessage: "Microphone disconnected. Switched to system default.",
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dock = canvas.getByTestId("ai-voice-dock");
    const dockButtons = within(dock).getAllByRole("button");
    const position = (element: HTMLElement) => {
      const { x, y, width, height } = element.getBoundingClientRect();

      return { x, y, width, height };
    };
    const positions = () => dockButtons.map(position);
    const beforeOpen = positions();
    await userEvent.click(
      canvas.getByRole("button", { name: "Audio options" }),
    );
    await expect(
      await canvas.findByRole("combobox", { name: "Voice" }),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole("combobox", { name: "Microphone" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: /^Voice/ }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByText(/^The voice applies next time/),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("combobox", { name: "Voice" }),
    ).toHaveAccessibleDescription("Wait for the agent to finish.");
    await expect(
      canvas.queryByText("Wait for the agent to finish."),
    ).not.toBeInTheDocument();
    const info = canvas.getByRole("button", { name: "About voice selection" });
    info.focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(
        canvas.getByText(
          "Applies next session. Mute your mic while the agent is idle to preview.",
        ),
      ).toBeVisible(),
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(async () => {
      await expect(info).toHaveFocus();
      await expect(info).toHaveAttribute("aria-expanded", "false");
    });
    await expect(
      canvas.queryByText(/Applies next session/),
    ).not.toBeInTheDocument();
    const speed = canvas.getByRole("slider", { name: "Speed" });
    await expect(speed).toBeInTheDocument();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    await expect(positions()).toEqual(beforeOpen);
    await expect(
      dockButtons
        .slice(0, 2)
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Hide conversation", "Show 1 Voice issue"]);
    speed.focus();
    await userEvent.keyboard("{ArrowLeft}");
    await expect(speed).toHaveAttribute("aria-valuenow", "1.2");
    await expect(getComputedStyle(speed).cursor).toBe("pointer");
    await expect(
      getComputedStyle(canvas.getByRole("slider", { name: "Speaker volume" }))
        .cursor,
    ).toBe("pointer");
    const devicesToggle = canvas.getByRole("button", {
      name: "Devices",
    });
    devicesToggle.focus();
    await userEvent.keyboard("{Enter}");
    await expect(devicesToggle).toHaveAttribute("aria-expanded", "true");
    await expect(
      canvas.getByRole("combobox", { name: "Microphone" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("combobox", { name: "Speaker" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("combobox", { name: "Voice" }),
    ).toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    await expect(devicesToggle).toHaveAttribute("aria-expanded", "false");
    await expect(
      canvas.queryByRole("combobox", { name: "Microphone" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("combobox", { name: "Voice" }),
    ).toBeInTheDocument();
    const interruptions = canvas.getByRole("checkbox", {
      name: "Allow interruptions",
    });
    await expect(interruptions).not.toBeChecked();
    await userEvent.click(interruptions);
    await expect(interruptions).toBeChecked();
    await userEvent.click(interruptions);
    await expect(interruptions).not.toBeChecked();
  },
};

export const AudioSettingsConnecting: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceModeAvailable
      voiceSession={liveSession({
        audioSettings: realisticAudioSettings({ speed: undefined }),
        phase: "connecting",
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Audio options" }),
    );
    const notice = await canvas.findByText(
      "Audio controls are unavailable until Voice is connected.",
    );
    const voice = canvas.getByRole("combobox", { name: "Voice" });
    await expect(notice.getBoundingClientRect().left).toBe(
      canvas.getByText("Voice", { exact: true }).getBoundingClientRect().left,
    );
    const devices = canvas.getByRole("button", { name: "Devices" });
    await expect(
      notice.getBoundingClientRect().top -
        devices.getBoundingClientRect().bottom,
    ).toBe(8);
    await expect(voice).toBeEnabled();
    await userEvent.click(voice);
    await userEvent.click(await canvas.findByRole("option", { name: "Coral" }));
    await expect(voice).toHaveTextContent("Coral");
  },
};

export const AudioSettingsUnavailableDevices: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceModeAvailable
      voiceSession={liveSession({
        audioSettings: realisticAudioSettings({
          speed: undefined,
          devices: {
            microphones: [],
            speakers: [],
            microphoneId: "",
            speakerId: "",
            canSelectSpeaker: false,
            canRequestSpeaker: false,
            busy: false,
            message: "Microphone permission is needed to list audio devices.",
          },
        }),
        phase: "connected",
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Audio options" }),
    );
    await userEvent.click(
      await canvas.findByRole("button", { name: "Devices" }),
    );
    await expect(
      await canvas.findByText(
        "Microphone permission is needed to list audio devices.",
      ),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("combobox", { name: "Speaker" }),
    ).toBeDisabled();
  },
};

const longVoiceStatus =
  "Voice admission could not be confirmed. Check canonical history before sending again; no automatic retry was made.";

export const VoiceSessionLongWarning: Story = {
  render: () => (
    <Frame
      fixedNarrowWidth
      initialVoiceDockCollapsed
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      status="streaming"
      voiceModeAvailable
      voiceProvider="realtime"
      voiceSession={liveSession({
        audioSettings: realisticAudioSettings(),
        canTakeTurn: true,
        notice: longVoiceStatus,
        phase: "speaking",
        warningMessage: longVoiceStatus,
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const frame = canvas.getByTestId("ai-assistant-story-frame");
    const dock = canvas.getByRole("region", { name: "Voice session" });
    const getPart = (part: string) => {
      const element = dock.querySelector<HTMLElement>(`[data-part="${part}"]`);
      if (!element) throw new Error(`Missing Voice dock part: ${part}`);

      return element;
    };

    await within(dock).findByRole("button", { name: "Show 1 Voice issue" });
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );

    const dockBounds = dock.getBoundingClientRect();
    const frameBounds = frame.getBoundingClientRect();
    const leftActions = getPart("left-actions");
    const center = getPart("shrinkable-status");
    const visibleStatus = getPart("visible-status");
    const rightActions = getPart("right-actions");
    const centerBounds = center.getBoundingClientRect();
    const leftBounds = leftActions.getBoundingClientRect();
    const rightBounds = rightActions.getBoundingClientRect();
    const statusBounds = visibleStatus.getBoundingClientRect();

    await expect(frameBounds.width).toBeLessThanOrEqual(390);
    await expect(dockBounds.left).toBeGreaterThanOrEqual(frameBounds.left);
    await expect(dockBounds.right).toBeLessThanOrEqual(frameBounds.right);
    await expect(centerBounds.left).toBeGreaterThanOrEqual(leftBounds.right);
    await expect(centerBounds.right).toBeLessThanOrEqual(rightBounds.left);
    await expect(statusBounds.left).toBeGreaterThanOrEqual(leftBounds.right);
    await expect(statusBounds.right).toBeLessThanOrEqual(rightBounds.left);

    for (const cluster of [leftActions, rightActions]) {
      await expect(cluster).toBeVisible();
      const clusterBounds = cluster.getBoundingClientRect();
      await expect(clusterBounds.width).toBeGreaterThan(0);
      await expect(clusterBounds.left).toBeGreaterThanOrEqual(dockBounds.left);
      await expect(clusterBounds.right).toBeLessThanOrEqual(dockBounds.right);
      for (const action of within(cluster).getAllByRole("button")) {
        await expect(action).toBeVisible();
        await expect(action.getBoundingClientRect().width).toBeGreaterThan(0);
      }
    }

    await expect(visibleStatus).toBeVisible();
    await expect(visibleStatus).toHaveTextContent(longVoiceStatus);
    await expect(visibleStatus.clientWidth).toBeGreaterThan(0);
    await expect(visibleStatus.scrollWidth).toBeGreaterThan(
      visibleStatus.clientWidth,
    );
    await expect(getComputedStyle(visibleStatus).textOverflow).toBe("ellipsis");
    await expect(
      within(dock).getByRole("status", { name: "Voice status" }),
    ).toHaveTextContent(`Voice status: ${longVoiceStatus}`);
  },
};

export const VoiceSessionInputNotRetained: Story = {
  render: () => (
    <Frame
      initialVoiceDockCollapsed
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceModeAvailable
      voiceSession={liveSession({
        phase: "connected",
        warningMessage:
          "That utterance was not retained. Wait for the pending input, then use the composer to send it.",
      })}
    />
  ),
};

export const VoiceSessionCollapsed: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceMode={<HostVoiceSlotPreview />}
      voiceModeAvailable
      voiceSession={liveSession({ microphoneLevel: 0.6 })}
    />
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: "Hide conversation",
      }),
    );
  },
};

export const VoiceSessionSpeaking: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceModeAvailable
      voiceSession={liveSession({
        phase: "speaking",
      })}
    />
  ),
};

export const FloatingVoiceSessionCollapsed: Story = {
  render: () => (
    <Frame
      initialPlacement="floating"
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceModeAvailable
      voiceSession={liveSession({ microphoneLevel: 0.6 })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dock = canvas.getByRole("region", { name: "Voice session" });
    const shell = dock.closest("aside")!;
    const frame = canvas.getByTestId("ai-assistant-story-frame");
    await userEvent.click(
      canvas.getByRole("button", { name: "Move AI assistant" }),
    );
    await userEvent.keyboard("{ArrowDown}{ArrowLeft}");
    const expanded = shell.getBoundingClientRect();
    await userEvent.click(
      canvas.getByRole("button", { name: "Hide conversation" }),
    );
    await waitFor(() =>
      expect(shell.getBoundingClientRect().height).toBe(
        dock.getBoundingClientRect().height,
      ),
    );
    await expect(shell.getBoundingClientRect().bottom).toBe(
      frame.getBoundingClientRect().bottom - 12,
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Show conversation" }),
    );
    await waitFor(() =>
      expect(shell.getBoundingClientRect().height).toBe(expanded.height),
    );
    await expect(shell.getBoundingClientRect().top).toBe(expanded.top);
    await expect(shell.getBoundingClientRect().right).toBe(expanded.right);
    await userEvent.click(
      canvas.getByRole("button", { name: "Hide conversation" }),
    );
  },
};

export const MicrophoneMutedWhileSpeaking: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceModeAvailable
      voiceProvider="live"
      voiceSession={liveSession({
        microphoneMuted: true,
        phase: "speaking",
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const dock = within(canvasElement).getByRole("region", {
      name: "Voice session",
    });
    await expect(within(dock).getByText("Speaking")).toBeInTheDocument();
    await expect(
      within(dock).getByRole("button", { name: "Unmute microphone" }),
    ).toHaveAttribute("aria-pressed", "true");
  },
};

export const SpeakerMutedWhileSpeaking: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceModeAvailable
      voiceProvider="live"
      voiceSession={liveSession({
        phase: "speaking",
        speakerMuted: true,
        speakerVolume: 0.55,
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dock = canvas.getByRole("region", { name: "Voice session" });
    await expect(within(dock).getByText("Speaking")).toBeInTheDocument();
    await userEvent.click(
      within(dock).getByRole("button", { name: "Audio options" }),
    );
    await expect(
      await canvas.findByRole("button", { name: "Unmute speaker" }),
    ).toHaveAttribute("aria-pressed", "true");
  },
};

export const VoiceSessionThinking: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      status="streaming"
      voiceModeAvailable
      voiceSession={liveSession({ phase: "thinking" })}
    />
  ),
  play: async ({ canvasElement }) => {
    const stop = within(canvasElement).getByRole("button", {
      name: "Stop AI response",
    });
    await expect(stop.getBoundingClientRect().width).toBe(28);
    await expect(stop.getBoundingClientRect().height).toBe(28);
    await expect(stop.querySelector("svg")).toHaveAttribute(
      "viewBox",
      "0 0 24 24",
    );
    await expect(stop.querySelector("rect")).toHaveAttribute("width", "11");
  },
};

export const VoiceSessionMuted: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceModeAvailable
      voiceSession={liveSession({ microphoneMuted: true, phase: "muted" })}
    />
  ),
};

export const VoiceSessionPaused: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceModeAvailable
      voiceProvider="realtime"
      voiceSession={liveSession({ phase: "paused" })}
    />
  ),
};

export const VoiceSessionRecovery: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceModeAvailable
      voiceProvider="realtime"
      voiceSession={liveSession({
        errorMessage:
          "Connection interrupted. Check your connection. (network)",
        phase: "error",
      })}
    />
  ),
};

export const StreamingMarkdown: Story = {
  render: () => (
    <Frame
      messages={[
        userMessage,
        {
          ...assistantMarkdownMessage,
          parts: assistantMarkdownMessage.parts.map((part) =>
            part.type === "text" ? { ...part, state: "streaming" } : part,
          ),
        },
      ]}
      status="streaming"
    />
  ),
};

/** Brunch Chat keeps its single action on the right while experiments run. */
export const BrunchComposerExperimentRunning: Story = {
  render: () => (
    <Frame
      experimentStates={{ running: { active: true } }}
      messages={[userMessage, assistantMarkdownMessage]}
      primaryLabel="Chat"
      presentation="brunch"
      promptChips={[
        { id: "review", label: "Review this net", prompt: "Review this net" },
      ]}
      status="streaming"
      voiceModeAvailable
    />
  ),
};

export const ReasoningCollapsed: Story = {
  render: () => <Frame messages={[userMessage, reasoningMessage]} />,
};

export const StreamingReasoning: Story = {
  render: () => (
    <Frame
      primaryLabel="Chat"
      presentation="brunch"
      messages={[userMessage, streamingReasoningMessage]}
      status="streaming"
    />
  ),
  play: async ({ canvasElement }) => {
    const stop = within(canvasElement).getByRole("button", {
      name: "Stop AI response",
    });
    await expect(stop.getBoundingClientRect().width).toBe(28);
    await expect(stop.getBoundingClientRect().height).toBe(28);
    await expect(
      parseFloat(getComputedStyle(stop).borderRadius),
    ).toBeGreaterThanOrEqual(14);
    const composer = within(canvasElement)
      .getByRole("textbox", {
        name: "Message AI assistant",
      })
      .getBoundingClientRect();
    await expect(stop.getBoundingClientRect().left).toBeGreaterThan(
      composer.left + composer.width / 2,
    );
  },
};

export const SingleCompletedToolCall: Story = {
  render: () => <Frame messages={[userMessage, singleToolCallMessage]} />,
};

export const CompletedToolCalls: Story = {
  render: () => <Frame messages={[userMessage, toolCallMessage]} />,
};

export const RenameDetail: Story = {
  render: () => <Frame messages={[userMessage, renamedToolCallMessage]} />,
};

export const MixedConversation: Story = {
  render: () => (
    <Frame
      messages={[
        userMessage,
        {
          ...reasoningMessage,
          parts: [
            ...reasoningMessage.parts,
            ...toolCallMessage.parts,
          ] as PetrinautAiMessage["parts"],
        },
        followUpUserMessage,
        streamingReasoningMessage,
      ]}
      status="streaming"
    />
  ),
};

export const ToolError: Story = {
  render: () => (
    <Frame
      messages={[
        {
          ...singleToolCallMessage,
          parts: singleToolCallMessage.parts.map((part) =>
            part.type.startsWith("tool-")
              ? {
                  ...part,
                  state: "output-error",
                  errorText: "Validation failed",
                }
              : part,
          ) as PetrinautAiMessage["parts"],
        },
      ]}
      status="error"
    />
  ),
};

export const NetworkError: Story = {
  render: () => <Frame error={errorMessage} messages={[userMessage]} />,
};

export const MultipleVoiceIssues: Story = {
  render: () => (
    <Frame
      messages={[userMessage]}
      voiceProvider="realtime"
      voiceSession={liveSession({
        phase: "error",
        errorMessage:
          "Voice connection interrupted. Check your connection before reconnecting.",
        warningMessage:
          "Voice admission could not be confirmed. Check canonical history before sending again; no automatic retry was made.",
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const ribbon = within(canvasElement).getByTestId("voice-session-indicator");
    await expect(ribbon).toHaveAttribute("data-phase", "error");
    if (!(ribbon instanceof HTMLCanvasElement)) {
      throw new Error("The error ribbon must use the animated waveform");
    }
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Let the first paint finish so a single static draw cannot pass.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      const initialFrame = ribbon.toDataURL();
      await waitFor(() => expect(ribbon.toDataURL()).not.toBe(initialFrame));
    }
  },
};

export const CollapsedVoiceIssues: Story = {
  render: () => (
    <Frame
      initialVoiceDockCollapsed
      messages={[userMessage]}
      voiceProvider="realtime"
      voiceSession={liveSession({
        phase: "error",
        errorMessage:
          "Voice connection interrupted. Check your connection before reconnecting.",
        warningMessage:
          "Voice admission could not be confirmed. Check canonical history before sending again; no automatic retry was made.",
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const indicator = canvas.getByRole("button", {
      name: "Show 2 Voice issues",
    });
    const { width, height } = indicator.getBoundingClientRect();
    await userEvent.click(
      canvas.getByRole("button", { name: "Show conversation" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Show 2 Voice issues" }),
    ).toBe(indicator);
    await expect(indicator.getBoundingClientRect()).toMatchObject({
      width,
      height,
    });
    await userEvent.click(indicator);
    await waitFor(() =>
      expect(
        canvas.getByText(
          "Voice connection interrupted. Check your connection before reconnecting.",
        ),
      ).toBeVisible(),
    );
    await userEvent.click(canvas.getByRole("button", { name: /^Close$/ }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Hide conversation" }),
    );
    await expect(indicator.getBoundingClientRect()).toMatchObject({
      width,
      height,
    });
  },
};

export const StoppedResponse: Story = {
  render: () => (
    <Frame
      messages={[
        userMessage,
        {
          ...reasoningMessage,
          parts: [reasoningMessage.parts[0]!],
        },
      ]}
      stopped
    />
  ),
};

export const WaitingForResponse: Story = {
  render: () => (
    <Frame
      messages={[userMessage, streamingReasoningMessage]}
      status="submitted"
    />
  ),
};

const BrunchWaitingPreview = () => {
  const [waiting, setWaiting] = useState(false);
  const [voice, setVoice] = useState(false);

  return (
    <>
      <Button onClick={() => setWaiting((value) => !value)}>
        Toggle waiting
      </Button>
      <Button onClick={() => setVoice((value) => !value)}>
        Toggle Voice preview
      </Button>
      <Frame
        key={String(voice)}
        extraTabs={[
          { id: "ledger", label: "Ledger", content: <p>Saved account</p> },
        ]}
        primaryLabel="Chat"
        presentation="brunch"
        messages={[userMessage]}
        promptChips={REVIEW_CHIPS}
        status={waiting ? "submitted" : "ready"}
        workingLabel="Working…"
        inputMode={voice ? "voice" : "text"}
        voiceModeAvailable
        voiceSession={voice ? liveSession({ phase: "listening" }) : undefined}
      />
    </>
  );
};

export const BrunchWaitingForResponse: Story = {
  render: () => <BrunchWaitingPreview />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const voice of [false, true]) {
      if (voice) {
        await userEvent.click(
          canvas.getByRole("button", { name: "Toggle Voice preview" }),
        );
      }
      const transcript = canvas.getByTestId("ai-transcript");
      const footer = voice
        ? canvas.getByRole("region", { name: "Voice session" })
        : canvas
            .getByRole("textbox", { name: "Message AI assistant" })
            .closest("form")!;
      const positions = () =>
        [transcript, footer].map((element) =>
          element.getBoundingClientRect().toJSON(),
        );
      const before = positions();
      await userEvent.click(
        canvas.getByRole("button", { name: "Toggle waiting" }),
      );
      const waiting = within(transcript).getByRole("status");
      await expect(waiting).toHaveTextContent("Working…");
      await expect(waiting).toBeVisible();
      await expect(positions()).toEqual(before);
      await expect(within(waiting).queryByRole("button")).toBeNull();
      await userEvent.click(
        canvas.getByRole("button", { name: "Toggle waiting" }),
      );
      await expect(
        canvasElement.querySelector('[data-work-status="pending"]'),
      ).not.toBeInTheDocument();
      await expect(positions()).toEqual(before);
    }
  },
};

const BrunchStreamingPreview = () => {
  const [step, setStep] = useState(0);
  const [finished, setFinished] = useState(false);

  return (
    <>
      <Button onClick={() => setStep((value) => value + 1)}>
        Stream update {step}
      </Button>
      <Button onClick={() => setFinished(true)}>Finish response</Button>
      <Frame
        primaryLabel="Chat"
        presentation="brunch"
        status={finished ? "ready" : "streaming"}
        messages={[
          userMessage,
          {
            id: "streaming-activity",
            role: "assistant",
            parts: [
              {
                type: "reasoning",
                text:
                  "**Compare capacity**\n\n" +
                  "Check each queue’s arrival rate against available service capacity.\n\n".repeat(
                    8 + step * 4,
                  ),
                state: finished || step % 2 === 1 ? "done" : "streaming",
              },
              {
                type: "dynamic-tool",
                toolName: "inspectModel",
                toolCallId: "inspection",
                input: {},
                ...(finished || step % 2 === 1
                  ? {
                      state: "output-available" as const,
                      output: { queues: 3 },
                    }
                  : { state: "input-available" as const }),
              },
              {
                type: "text",
                text: "I’ll compare the three queues.",
                state: "done",
              },
            ],
          },
        ]}
      />
    </>
  );
};

/** Where the Activity label sits in the transcript's content, unaffected by auto-follow scrolling. */
const activityLabelOffset = (canvasElement: HTMLElement) => {
  const transcript = within(canvasElement).getByTestId("ai-transcript");
  const labels = transcript.querySelectorAll<HTMLElement>(
    "[data-work-status] [data-label]",
  );
  if (labels.length !== 1) {
    throw new Error(`Expected one Activity label, found ${labels.length}`);
  }
  const frame = transcript.getBoundingClientRect();
  const label = labels[0]!.getBoundingClientRect();

  return {
    x: label.x - frame.x,
    y: label.y - frame.y + transcript.scrollTop,
  };
};

export const BrunchStreamingActivity: Story = {
  render: () => <BrunchStreamingPreview />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const activity = canvas.getByRole("button", { name: "Working…" });
    const details = canvasElement.querySelector<HTMLElement>(
      "[data-work-details]",
    )!;
    await Promise.all(
      canvasElement
        .getAnimations({ subtree: true })
        .filter(
          (animation) => animation.effect?.getTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished),
    );
    await expect(details.scrollHeight).toBe(details.clientHeight);
    const labelOffset = activityLabelOffset(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Stream update 0" }),
    );
    await expect(activity).toHaveAttribute("aria-expanded", "true");
    await expect(details.scrollHeight).toBe(details.clientHeight);
    await expect(activityLabelOffset(canvasElement)).toEqual(labelOffset);
    await userEvent.click(activity);
    await waitFor(() =>
      expect(
        details.closest("[data-scope=collapsible][data-part=content]"),
      ).not.toBeVisible(),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Stream update 1" }),
    );
    await expect(activity).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(
      canvas.getByRole("button", { name: "Finish response" }),
    );
    await expect(activity).toHaveAttribute("aria-expanded", "false");
    await expect(activity).toHaveTextContent(/^Activity/u);
    await expect(activityLabelOffset(canvasElement)).toEqual(labelOffset);
    await userEvent.click(activity);
    await expect(activity).toHaveAttribute("aria-expanded", "true");
  },
};

const voiceTurnRequest: PetrinautAiMessage = {
  ...userMessage,
  metadata: { source: "voice" },
};

const voiceTurnReply: PetrinautAiMessage = {
  id: "voice-reply:user-1",
  role: "assistant",
  metadata: { source: "voice" },
  parts: [
    {
      type: "data-voiceAgentReply",
      data: {
        text: "Sure, I’ll ask Brunch to build that supply chain.",
        state: "done",
      },
    },
  ],
};

const voiceTurnSteps: {
  status: "submitted" | "streaming" | "ready";
  response?: PetrinautAiMessage["parts"];
}[] = [
  { status: "submitted" },
  {
    status: "streaming",
    response: [{ type: "reasoning", text: "Plan stages", state: "streaming" }],
  },
  {
    status: "streaming",
    response: [
      { type: "reasoning", text: "Plan stages", state: "done" },
      {
        type: "dynamic-tool",
        toolName: "inspectModel",
        toolCallId: "voice-turn-inspection",
        input: {},
        state: "input-available",
      },
    ],
  },
  {
    status: "ready",
    response: [
      { type: "reasoning", text: "Plan stages", state: "done" },
      {
        type: "dynamic-tool",
        toolName: "inspectModel",
        toolCallId: "voice-turn-inspection",
        input: {},
        state: "output-available",
        output: { places: 4 },
      },
      {
        type: "text",
        text: "The supply chain has four stages.",
        state: "done",
      },
    ],
  },
];

const BrunchVoiceTurnPreview = () => {
  const [step, setStep] = useState(0);
  const [voice, setVoice] = useState(true);
  const { status, response } = voiceTurnSteps[step]!;

  return (
    <>
      <Button
        onClick={() =>
          setStep((value) => Math.min(value + 1, voiceTurnSteps.length - 1))
        }
      >
        Next turn step
      </Button>
      <Button
        onClick={() => {
          setVoice((value) => !value);
          setStep(0);
        }}
      >
        Toggle Voice preview
      </Button>
      <Frame
        key={String(voice)}
        primaryLabel="Chat"
        presentation="brunch"
        messages={[
          voiceTurnRequest,
          voiceTurnReply,
          ...(response
            ? [
                {
                  id: "voice-turn-response",
                  role: "assistant" as const,
                  parts: response,
                },
              ]
            : []),
        ]}
        status={status}
        inputMode={voice ? "voice" : "text"}
        voiceModeAvailable
        voiceSession={voice ? liveSession({ phase: "thinking" }) : undefined}
      />
    </>
  );
};

export const BrunchVoiceTurnActivity: Story = {
  render: () => <BrunchVoiceTurnPreview />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const voice of [true, false]) {
      if (!voice) {
        await userEvent.click(
          canvas.getByRole("button", { name: "Toggle Voice preview" }),
        );
      }
      await expect(
        within(canvas.getByTestId("ai-transcript")).getByRole("status"),
      ).toHaveTextContent("Working…");
      const labelOffset = activityLabelOffset(canvasElement);
      for (let i = 1; i < voiceTurnSteps.length; i++) {
        await userEvent.click(
          canvas.getByRole("button", { name: "Next turn step" }),
        );
        await expect(activityLabelOffset(canvasElement)).toEqual(labelOffset);
      }
    }
  },
};

export const LiveSessionSubmittedWork: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, streamingReasoningMessage]}
      status="submitted"
      voiceModeAvailable
      voiceProvider="live"
      voiceSession={liveSession({ phase: "thinking" })}
    />
  ),
  play: async ({ canvasElement }) => {
    const dock = within(canvasElement).getByRole("region", {
      name: "Voice session",
    });
    const stop = within(dock).getByRole("button", {
      name: "Stop AI response",
    });
    const end = within(dock).getByRole("button", { name: "End voice mode" });
    await expect(stop).not.toBe(end);
    await expect(stop.parentElement?.parentElement).toBe(
      end.parentElement?.parentElement,
    );
  },
};

export const LiveSessionStreamingWork: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, streamingReasoningMessage]}
      status="streaming"
      voiceModeAvailable
      voiceProvider="live"
      voiceSession={liveSession({ phase: "speaking" })}
    />
  ),
  play: async ({ canvasElement }) => {
    const dock = within(canvasElement).getByRole("region", {
      name: "Voice session",
    });
    const stop = within(dock).getByRole("button", {
      name: "Stop AI response",
    });
    const end = within(dock).getByRole("button", { name: "End voice mode" });
    await expect(stop).not.toBe(end);
    await expect(stop.parentElement?.parentElement).toBe(
      end.parentElement?.parentElement,
    );
  },
};

export const NarrowVoiceDockWithAudioOptions: Story = {
  render: () => (
    <Frame
      fixedNarrowWidth
      initialVoiceDockCollapsed
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceModeAvailable
      voiceProvider="live"
      voiceSession={liveSession({
        phase: "speaking",
        speakerMuted: true,
        speakerVolume: 0.6,
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const frame = canvas.getByTestId("ai-assistant-story-frame");
    const dock = canvas.getByRole("region", { name: "Voice session" });

    const audioOptions = within(dock).getByRole("button", {
      name: "Audio options",
    });
    await userEvent.click(audioOptions);
    const volume = await canvas.findByRole("slider", {
      name: "Speaker volume",
    });
    const popover = volume.closest<HTMLElement>(
      '[data-scope="popover"][data-part="content"]',
    )!;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );

    const frameBounds = frame.getBoundingClientRect();
    for (const element of [dock, popover]) {
      const bounds = element.getBoundingClientRect();
      await expect(bounds.left).toBeGreaterThanOrEqual(frameBounds.left - 1);
      await expect(bounds.right).toBeLessThanOrEqual(frameBounds.right + 1);
    }
    const triggerBounds = audioOptions.getBoundingClientRect();
    const popoverBounds = popover.getBoundingClientRect();
    await expect(
      Math.abs(popoverBounds.right - triggerBounds.right),
    ).toBeLessThan(2);
    await expect(
      triggerBounds.top - popoverBounds.bottom,
    ).toBeGreaterThanOrEqual(3);
    await expect(triggerBounds.top - popoverBounds.bottom).toBeLessThanOrEqual(
      5,
    );
  },
};

const toolLifecycleResolver: PetrinautAiToolPresentationResolver = ({
  state,
}) => ({
  title:
    state === "pending"
      ? "Checking model diagnostics"
      : state === "success"
        ? "Checked model diagnostics"
        : "Could not check model diagnostics",
});

const PendingToolLifecycleHarness = () => {
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setRunning(false), 3_000);

    return () => window.clearTimeout(timer);
  }, [running]);

  const toolMessage: PetrinautAiMessage = {
    id: "assistant-visible-tool-lifecycle",
    role: "assistant",
    parts: running
      ? [
          {
            type: "dynamic-tool",
            toolName: "read_petrinaut_diagnostics",
            state: "input-available",
            toolCallId: "visible-tool-lifecycle",
            input: {},
          },
        ]
      : [
          {
            type: "dynamic-tool",
            toolName: "read_petrinaut_diagnostics",
            state: "output-available",
            toolCallId: "visible-tool-lifecycle",
            input: {},
            output: {
              title: "No model diagnostics",
              detail: "No errors or warnings found.",
            },
          },
        ],
  };

  return (
    <>
      <div className={css({ padding: "4" })}>
        <Button
          disabled={running}
          onClick={() => setRunning(true)}
          size="sm"
          type="button"
          variant="solid"
        >
          {running ? "Faux tool running…" : "Run faux tool"}
        </Button>
      </div>
      <Frame
        messages={[userMessage, toolMessage]}
        primaryLabel="Chat"
        presentation="brunch"
        resolveToolPresentation={toolLifecycleResolver}
        status={running ? "streaming" : "ready"}
        workingLabel="Working…"
      />
    </>
  );
};

/**
 * Manual, no-provider harness: run the 3-second faux tool to inspect the same
 * pending → completed row transition used by the production panel.
 */
export const VisiblePendingToolLifecycle: Story = {
  render: () => <PendingToolLifecycleHarness />,
};

const applyAutoLayoutPendingMessage: PetrinautAiMessage = {
  id: "assistant-apply-auto-layout-pending",
  role: "assistant",
  parts: [
    {
      type: "tool-applyAutoLayout",
      state: "input-available",
      toolCallId: "tool-apply-auto-layout-pending",
      input: { askUserFirst: true },
    },
  ],
};

const applyAutoLayoutAppliedMessage: PetrinautAiMessage = {
  id: "assistant-apply-auto-layout-applied",
  role: "assistant",
  parts: [
    {
      type: "tool-applyAutoLayout",
      state: "output-available",
      toolCallId: "tool-apply-auto-layout-applied",
      input: { askUserFirst: true },
      output: { applied: true, title: "Auto-laid out 8 nodes" },
    },
  ],
};

const applyAutoLayoutDeclinedMessage: PetrinautAiMessage = {
  id: "assistant-apply-auto-layout-declined",
  role: "assistant",
  parts: [
    {
      type: "tool-applyAutoLayout",
      state: "output-available",
      toolCallId: "tool-apply-auto-layout-declined",
      input: { askUserFirst: true },
      output: { applied: false, reason: "User declined auto-layout." },
    },
  ],
};

export const ApplyAutoLayoutAwaitingConfirmation: Story = {
  render: () => (
    <Frame messages={[userMessage, applyAutoLayoutPendingMessage]} />
  ),
};

export const ApplyAutoLayoutApplied: Story = {
  render: () => (
    <Frame messages={[userMessage, applyAutoLayoutAppliedMessage]} />
  ),
};

export const ApplyAutoLayoutDeclined: Story = {
  render: () => (
    <Frame messages={[userMessage, applyAutoLayoutDeclinedMessage]} />
  ),
};

const conversationTurn: PetrinautAiMessage = {
  id: "support-desk",
  role: "assistant",
  parts: [
    {
      type: "reasoning",
      text: "**Compare capacity**\n\nUse the stated arrival and handling rates; leave the unknown peak rate open.",
      state: "done",
      providerMetadata: { petrinaut: { startedAt: 1000, finishedAt: 8000 } },
    },
    ...singleToolCallMessage.parts,
    {
      type: "text",
      state: "done",
      text: "The support desk is ready to explore.\n\n- **Queue** holds incoming requests.\n- **Agents** controls available capacity.\n- Compare **2–8 agents** before choosing a staffing level.",
    },
  ],
};
const supportDeskUser: PetrinautAiMessage = {
  id: "support-user",
  role: "user",
  parts: [
    {
      type: "text",
      text: "Compare two to eight agents. Handling takes about six minutes, and requests wait in one queue.",
    },
  ],
};
const ledgerTab = {
  id: "ledger",
  label: "Ledger",
  content: <p>Support desk · arrival rate still open</p>,
};

export const ChatTurn: Story = {
  render: () => (
    <Frame
      presentation="brunch"
      extraTabs={[ledgerTab]}
      messages={[supportDeskUser, conversationTurn]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const activity = canvas.getByRole("button", { name: "Activity" });
    const assistantTurn = activity.closest("[data-role=assistant]")!;
    await expect(getComputedStyle(assistantTurn).paddingTop).toBe("4px");
    await expect(
      getComputedStyle(assistantTurn.querySelector("[data-answer=brunch]")!)
        .marginTop,
    ).toBe("4px");
    await userEvent.click(activity);
    // Disclosures are inline labels, not raised action buttons or full rows.
    await expect(getComputedStyle(activity).boxShadow).toBe("none");
    await expect(getComputedStyle(activity).borderTopWidth).toBe("0px");
    for (const name of ["Thought for 7s", "Used 1 tool"]) {
      const disclosure = canvas.getByRole("button", { name });
      await expect(disclosure.getBoundingClientRect().width).toBeLessThan(180);
      await userEvent.click(disclosure);
      await expect(disclosure).toHaveAttribute("aria-expanded", "true");
    }
    await waitFor(() =>
      expect(canvas.getByText("Compare capacity")).toBeVisible(),
    );
    await userEvent.click(activity);
    await userEvent.keyboard("{Enter}");
    await expect(activity).toHaveAttribute("aria-expanded", "true");
  },
};

export const VoiceMediatedTurn: Story = {
  render: () => (
    <Frame
      presentation="brunch"
      extraTabs={[ledgerTab]}
      inputMode="voice"
      voiceModeAvailable
      voiceSession={liveSession({ phase: "speaking" })}
      messages={[
        {
          ...supportDeskUser,
          metadata: { source: "voice" },
          parts: [
            ...supportDeskUser.parts,
            {
              type: "data-brief",
              data: {
                state: "done",
                fields: {
                  decide: "Compare 2–8 agents",
                  measure: "Queue waiting time",
                  stillOpen: "Arrival rate",
                },
              },
            },
          ],
        },
        {
          ...conversationTurn,
          parts: [
            {
              type: "data-voiceAgentReply",
              data: {
                state: "done",
                text: "I’ll ask Brunch to compare those staffing levels.",
              },
            },
            ...conversationTurn.parts,
            {
              type: "data-voiceAgentWrapUp",
              data: {
                state: "done",
                text: "The model is ready. We still need the arrival rate before running the comparison.",
              },
            },
          ],
        },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const summary = canvas.getByText("Request sent").closest("summary")!;
    const userTurn = summary.closest("[data-role=user]")!;
    const assistantTurn = canvasElement.querySelector("[data-role=assistant]")!;
    await expect(getComputedStyle(userTurn).gap).toBe("2px");
    await expect(getComputedStyle(assistantTurn).gap).toBe("4px");
    await expect(getComputedStyle(assistantTurn).paddingTop).toBe("6px");
    await expect(getComputedStyle(summary).padding).toBe("2px 6px 2px 2px");
    await userEvent.click(summary);
    await expect(summary.closest("details")).toHaveAttribute("open");
    await expect(
      getComputedStyle(canvas.getByText("Prepared from what you said"))
        .fontSize,
    ).toBe("11px");
    await expect(
      getComputedStyle(canvas.getByText("Arrival rate")).fontSize,
    ).toBe("13px");
    await userEvent.click(summary);
  },
};

export const ChatVoiceOrigin: Story = {
  render: () => (
    <Frame
      presentation="brunch"
      extraTabs={[ledgerTab]}
      messages={[
        { ...supportDeskUser, metadata: { source: "voice" } },
        conversationTurn,
        {
          id: "typed-follow-up",
          role: "user",
          parts: [{ type: "text", text: "Keep the comparison as a draft." }],
        },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getAllByRole("img", { name: "Sent using voice" }),
    ).toHaveLength(1);
    await expect(
      canvas
        .getByRole("img", { name: "Sent using voice" })
        .querySelector("svg"),
    ).toHaveAttribute("width", "12");
  },
};

export const ChatAnswerActions: Story = {
  render: () => (
    <Frame
      presentation="brunch"
      messages={[
        supportDeskUser,
        conversationTurn,
        {
          id: "next-question",
          role: "user",
          parts: [{ type: "text", text: "What is still open?" }],
        },
        {
          id: "next-answer",
          role: "assistant",
          parts: [{ type: "text", text: "We still need the arrival rate." }],
        },
        {
          id: "unsent-answer",
          role: "user",
          parts: [{ type: "text", text: "Keep the draft." }],
        },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const copies = canvas.getAllByRole("button", { name: "Copy answer" });
    const older = copies[0]!;
    const latest = copies[1]!;
    const olderActions = older.closest("[data-answer-actions]")!;
    const latestActions = latest.closest("[data-answer-actions]")!;
    await expect(getComputedStyle(olderActions).opacity).toBe("0");
    await expect(getComputedStyle(latestActions).opacity).toBe("1");
    older.focus();
    await expect(getComputedStyle(olderActions).opacity).toBe("1");
    older.blur();
    await expect(getComputedStyle(olderActions).opacity).toBe("0");
  },
};

export const VoicePreparing: Story = {
  render: () => (
    <Frame
      presentation="brunch"
      extraTabs={[ledgerTab]}
      inputMode="voice"
      voiceModeAvailable
      voiceSession={liveSession({ phase: "thinking" })}
      messages={[
        {
          ...supportDeskUser,
          parts: [
            ...supportDeskUser.parts,
            {
              type: "data-brief",
              data: {
                state: "streaming",
                fields: {},
              },
            },
          ],
        },
        {
          id: "preparing-reply",
          role: "assistant",
          parts: [
            {
              type: "data-voiceAgentReply",
              data: {
                state: "streaming",
                text: "I’ll prepare that comparison.",
              },
            },
          ],
        },
      ]}
    />
  ),
};

export const VoiceSending: Story = {
  render: () => (
    <Frame
      presentation="brunch"
      inputMode="voice"
      voiceModeAvailable
      voiceSession={liveSession({ phase: "thinking" })}
      messages={[
        {
          ...supportDeskUser,
          parts: [
            ...supportDeskUser.parts,
            {
              type: "data-brief",
              data: {
                state: "streaming",
                fields: {
                  decide: "Compare 2–8 agents",
                  measure: "Queue waiting time",
                },
              },
            },
          ],
        },
      ]}
    />
  ),
};

const VoicePreparationFailure = () => {
  const [admitted, setAdmitted] = useState(false);

  return (
    <>
      <Button onClick={() => setAdmitted(true)}>Confirm admission</Button>
      <Frame
        presentation="brunch"
        inputMode="voice"
        voiceModeAvailable
        voiceSession={liveSession({ phase: "thinking" })}
        messages={[
          {
            ...supportDeskUser,
            parts: [
              ...supportDeskUser.parts,
              {
                type: "data-brief",
                data: {
                  state: admitted ? "done" : "streaming",
                  fields: {},
                  preparationFailed: true,
                },
              },
            ],
          },
        ]}
      />
    </>
  );
};

export const VoicePreparationFailed: Story = {
  render: () => <VoicePreparationFailure />,
};

export const VoiceStopped: Story = {
  render: () => (
    <Frame
      presentation="brunch"
      extraTabs={[ledgerTab]}
      inputMode="voice"
      voiceModeAvailable
      voiceSession={liveSession({ phase: "listening" })}
      stopped
      messages={[supportDeskUser, conversationTurn]}
    />
  ),
};

const ExperimentExample = ({
  finished = false,
  optimization = true,
}: {
  finished?: boolean;
  optimization?: boolean;
}) => {
  const [cancelled, setCancelled] = useState(false);

  return (
    <Frame
      presentation="brunch"
      extraTabs={[ledgerTab]}
      onCancelExperiment={() => setCancelled(true)}
      messages={[
        supportDeskUser,
        {
          ...conversationTurn,
          parts: [
            ...conversationTurn.parts,
            {
              type: "tool-createExperiment",
              state: "input-available",
              toolCallId: "running-experiment",
              input: {
                name: "Compare staffing",
                scenarioId: "staffing",
                scenarioParameterValues: {},
                runCount: 12,
                seed: 1,
                dt: 1,
                maxTime: 60,
                metricIds: ["wait"],
                execution: optimization
                  ? {
                      mode: "optimize",
                      objectiveMetricId: "wait",
                      direction: "minimize",
                      steps: 8,
                      runsPerStep: 12,
                    }
                  : { mode: "simulate" },
              },
            },
          ],
        },
      ]}
      experimentStates={{
        "running-experiment": {
          active: !cancelled && !finished,
          result:
            cancelled || finished
              ? {
                  name: "Compare staffing",
                  experimentId: "staffing",
                  status: cancelled ? "cancelled" : "complete",
                  runsCompleted: cancelled ? 29 : 96,
                  metrics: finished
                    ? [
                        { id: "wait", label: "Lowest wait (min)", value: 0.3 },
                        { id: "agents", label: "Agents", value: 8 },
                      ]
                    : [],
                }
              : undefined,
          progress: {
            name: "Compare staffing",
            experimentId: "staffing",
            phase: optimization ? "optimizing" : "running",
            runsCompleted: 5,
            runsTarget: 12,
            step: 3,
            steps: 8,
          },
        },
      }}
    />
  );
};

export const RunningExperiment: Story = {
  render: () => <ExperimentExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const card = canvas.getByRole("region", {
      name: "Experiment: Compare staffing",
    });
    const progress = within(card).getByRole("progressbar");
    await expect(getComputedStyle(card).backgroundImage).toContain(
      "linear-gradient",
    );
    await expect(getComputedStyle(progress).height).toBe("5px");
    await expect(
      card.querySelector("strong")?.nextElementSibling?.textContent,
    ).toContain("5 of 12 runs");
  },
};

export const RunningSimulation: Story = {
  ...RunningExperiment,
  render: () => <ExperimentExample optimization={false} />,
};

export const FinishedExperiment: Story = {
  render: () => <ExperimentExample finished />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const card = canvas.getByRole("region", {
      name: "Experiment: Compare staffing",
    });
    const metrics = card.querySelector("dl")!;
    await expect(getComputedStyle(metrics).display).toBe("flex");
    for (const metric of metrics.children) {
      await expect(getComputedStyle(metric).borderTopWidth).toBe("0px");
      await expect(getComputedStyle(metric).padding).toBe("0px");
    }
    await expect(within(card).queryByRole("progressbar")).toBeNull();
    await expect(within(card).getByRole("status")).toHaveTextContent(
      "Finished",
    );
  },
};

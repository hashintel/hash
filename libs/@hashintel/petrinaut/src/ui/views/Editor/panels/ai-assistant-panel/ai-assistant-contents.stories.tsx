import {
  type ComponentProps,
  type ReactNode,
  use,
  useEffect,
  useState,
} from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";

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

import type { VoiceAudioSettingsState } from "../../../../../react/voice-session/types";
import type { PetrinautAiToolPresentationResolver } from "../../../../petrinaut";
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
  additionalTab,
  error,
  fixedNarrowWidth = false,
  initialPlacement = "docked",
  initialVoiceDockCollapsed = false,
  inputMode = "text",
  messages,
  primaryLabel,
  resolveToolPresentation,
  status = "ready",
  stopped = false,
  voiceMode,
  voiceModeAvailable = false,
  voiceProvider = "live",
  voiceSession,
  workingLabel,
}: {
  additionalTab?: ComponentProps<typeof AiAssistantContents>["additionalTab"];
  error?: Error;
  fixedNarrowWidth?: boolean;
  initialPlacement?: "docked" | "floating";
  initialVoiceDockCollapsed?: boolean;
  inputMode?: "text" | "voice";
  messages: PetrinautAiMessage[];
  primaryLabel?: string;
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
            additionalTab={additionalTab}
            error={error}
            input={input}
            inputMode={inputMode}
            messages={messages}
            isOpen={isOpen}
            primaryLabel={primaryLabel}
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
  render: () => <Frame messages={[]} />,
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
      additionalTab={{
        label: "Workpiece",
        content: (
          <div>
            <h2>Model account</h2>
            <p>A saved description of the process being modeled.</p>
          </div>
        ),
      }}
      messages={[userMessage, assistantMarkdownMessage]}
    />
  ),
};

export const EmptyWithVoiceAvailable: Story = {
  render: () => <Frame messages={[]} voiceModeAvailable />,
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
    const realTimeToggle = canvas.getByRole("button", { name: "Real-time" });
    await userEvent.click(realTimeToggle);
    await expect(realTimeToggle).toHaveAttribute("aria-expanded", "true");
    const speed = canvas.getByRole("slider", { name: "Speed" });
    await expect(speed).toBeInTheDocument();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    await expect(positions()).toEqual(beforeOpen);
    await expect(
      dockButtons
        .slice(0, 3)
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Hide conversation", "Audio options", "Show 1 Voice issue"]);
    speed.focus();
    await userEvent.keyboard("{ArrowLeft}");
    await expect(speed).toHaveAttribute("aria-valuenow", "1");
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

export const VoiceSessionLongWarning: Story = {
  render: () => (
    <Frame
      initialVoiceDockCollapsed
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceModeAvailable
      voiceSession={liveSession({
        phase: "connected",
        warningMessage:
          "Voice admission could not be confirmed. Check canonical history before sending again; no automatic retry was made.",
      })}
    />
  ),
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
      voiceModeAvailable
      voiceSession={liveSession({ phase: "thinking" })}
    />
  ),
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

export const ReasoningCollapsed: Story = {
  render: () => <Frame messages={[userMessage, reasoningMessage]} />,
};

export const StreamingReasoning: Story = {
  render: () => (
    <Frame
      messages={[userMessage, streamingReasoningMessage]}
      status="streaming"
    />
  ),
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
      Math.abs(popoverBounds.left - triggerBounds.left),
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
        resolveToolPresentation={toolLifecycleResolver}
        status={running ? "streaming" : "ready"}
        workingLabel="Brunch is working"
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

import { createContext, use, useEffect, useState, type ReactNode } from "react";

import { css } from "@hashintel/ds-helpers/css";
import { ErrorTrackerContext } from "@hashintel/petrinaut/react";
import {
  definePetrinautPlugin,
  pluginService,
  usePluginService,
  type AccessApi,
  type PluginHook,
} from "@hashintel/petrinaut/ui/plugin";

import { AiAssistantPanel } from "./chat/ai-assistant-panel";
import { AiVoiceModeIcon } from "./chat/ai-voice-mode-button";

import type { PetrinautAiAssistant } from "./chat/petrinaut";

/** How the empty-net prompt starts the chat, which consumes it once. */
type PromptStart =
  | { readonly mode: "text"; readonly text: string }
  | { readonly mode: "voice" };

const brunchAccess = {
  document: "write",
  experiments: "write",
  editor: "write",
} as const;

/** What Brunch's chat, cards and controls reach inside the editor. */
export type BrunchEditorApi = AccessApi<typeof brunchAccess>;

/**
 * Brunch's assistant, from the host that assembles it outside the editor to
 * the plugin that renders it inside. The host provides it above `<Petrinaut>`
 * while the editor shows Brunch's assistant, and `null` otherwise.
 */
export const BrunchAssistantContext =
  createContext<PetrinautAiAssistant | null>(null);

const BrunchPlugin = definePetrinautPlugin({
  id: "website.brunch",
  name: "Brunch",
  description:
    "Brunch's assistant: its chat, Ledger and Voice, with the open net, its experiments and the editor's navigation.",
  author: "HASH",
  access: brunchAccess,
  assistant: true,
  provides: pluginService<BrunchEditorApi>(),
});

/**
 * Renders Brunch's chat as the editor's assistant, and hands its `api` to
 * Brunch's cards.
 */
const useBrunchPlugin: PluginHook<typeof BrunchPlugin> = (api) => {
  const assistant = use(BrunchAssistantContext);
  const [start, setStart] = useState<PromptStart | null>(null);

  return {
    provides: api,
    assistant: {
      // Empty while the host binds Brunch's conversation to the open net.
      content: assistant && (
        <AiAssistantPanel
          aiAssistant={assistant}
          api={api}
          initialMessage={start?.mode === "text" ? start.text : null}
          onInitialMessageConsumed={() => setStart(null)}
          // The prompt picks the chat's mode, so its text never reaches a
          // Voice mode left from an earlier session.
          initialInteractionMode={start?.mode ?? null}
          onInitialInteractionModeConsumed={() => setStart(null)}
        />
      ),
      onPrompt: (text) => setStart({ mode: "text", text }),
      ...(assistant?.renderVoiceMode && {
        startAction: {
          label: "Start voice mode",
          icon: <AiVoiceModeIcon size={20} />,
          run: () => setStart({ mode: "voice" }),
        },
      }),
    },
  };
};

/** Brunch's assistant: its chat fills the assistant panel while the editor shows it. */
export const brunchPlugin = BrunchPlugin(useBrunchPlugin);

const missingPluginStyle = css({
  padding: "2",
  borderRadius: "md",
  backgroundColor: "red.a10",
  color: "neutral.s100",
  fontSize: "xs",
  lineHeight: "relaxed",
});

/**
 * Renders `children` with the Brunch plugin's `api`. The editor shows its view
 * only after every plugin has run, so a missing `api` means the host left the
 * plugin out or it failed: the card says so and the failure is reported,
 * rather than an approval waiting with nothing to answer it.
 */
export const WithBrunchEditorApi = ({
  children,
}: {
  children: (api: BrunchEditorApi) => ReactNode;
}) => {
  const api = usePluginService(BrunchPlugin);
  const { captureException } = use(ErrorTrackerContext);
  const missing = api === undefined;
  useEffect(() => {
    if (missing) {
      captureException(new Error("The Brunch editor plugin is not running"), {
        source: "brunch.editor-plugin",
      });
    }
  }, [missing, captureException]);

  return api === undefined ? (
    <p className={missingPluginStyle} role="alert">
      Brunch can’t show this card because its editor plugin isn’t running.
    </p>
  ) : (
    children(api)
  );
};

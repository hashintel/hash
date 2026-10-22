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
 * and adds `brunchPlugin` to the editor's plugins only while it is set.
 */
export const BrunchAssistantContext =
  createContext<PetrinautAiAssistant | null>(null);

const BrunchPlugin = definePetrinautPlugin({
  id: "website.brunch",
  name: "Brunch",
  description:
    "Brunch's assistant: its chat, Ledger and Voice, with the open net, its experiments and the editor's navigation.",
  author: "HASH",
  // Brunch's chat and cards can't work without it, so the user cannot switch it off.
  required: true,
  access: brunchAccess,
  assistant: true,
  provides: pluginService<BrunchEditorApi>(),
});

/** What the empty-net prompt hands the chat, which consumes it once. */
type BrunchChatStart = { readonly text: string } | { readonly voice: true };

/**
 * Renders Brunch's chat as the editor's assistant, and hands its `api` to
 * Brunch's cards.
 */
const useBrunchPlugin: PluginHook<typeof BrunchPlugin> = (api) => {
  const assistant = use(BrunchAssistantContext);
  const [start, setStart] = useState<BrunchChatStart | null>(null);
  if (assistant === null) {
    throw new Error(
      "The Brunch plugin runs only while its host provides BrunchAssistantContext.",
    );
  }

  return {
    provides: api,
    assistant: {
      content: (
        <AiAssistantPanel
          aiAssistant={assistant}
          api={api}
          initialMessage={start !== null && "text" in start ? start.text : null}
          onInitialMessageConsumed={() => setStart(null)}
          // Text from the prompt selects text, as the built-in chat's did,
          // so it never reaches a Voice mode left from an earlier start.
          initialInteractionMode={
            start === null ? null : "voice" in start ? "voice" : "text"
          }
          onInitialInteractionModeConsumed={() => setStart(null)}
        />
      ),
      onPrompt: (text) => setStart({ text }),
      // Voice is Brunch's alone: the prompt offers it only while Brunch does.
      ...(assistant.renderVoiceMode === undefined
        ? {}
        : {
            startAction: {
              label: "Start voice mode",
              icon: <AiVoiceModeIcon size={20} />,
              run: () => setStart({ voice: true }),
            },
          }),
    },
  };
};

/** Runs while Brunch is the assistant: its chat fills the assistant panel. */
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

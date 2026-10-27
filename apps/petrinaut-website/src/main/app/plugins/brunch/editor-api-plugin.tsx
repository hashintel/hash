import {
  createContext,
  use,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";

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

import type { PetrinautAiAssistant } from "./chat/petrinaut";

const brunchAccess = {
  document: "write",
  experiments: "write",
  editor: "write",
} as const;

/** What Brunch's chat, cards and controls reach inside the editor. */
export type BrunchEditorApi = AccessApi<typeof brunchAccess>;

/**
 * Brunch's assistant, between the host that assembles it outside the editor
 * and the plugin that renders it inside. The host provides it above
 * `<Petrinaut>`. The plugin's content calls `show` while the editor shows
 * Brunch's assistant on a document, and the host assembles `assistant` for
 * that document only.
 */
export interface BrunchAssistantHost {
  /** Brunch's assistant, or `null` until the host binds its conversation. */
  readonly assistant: PetrinautAiAssistant | null;
  /**
   * Marks Brunch's assistant as shown on the document with `documentId`, and
   * returns the call that unmarks it.
   */
  readonly show: (documentId: string) => () => void;
}

export const BrunchAssistantContext = createContext<BrunchAssistantHost | null>(
  null,
);

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

const connectingStyle = css({
  margin: "auto",
  color: "neutral.s90",
  fontSize: "sm",
});

/**
 * Brunch's panel content. The editor mounts it only while it shows Brunch's
 * assistant, so it marks Brunch as shown on `documentId` for the host, which
 * connects Brunch only then, and renders `children` once the host has bound
 * the conversation.
 */
const BrunchAssistantContent = ({
  documentId,
  children,
}: {
  documentId: string;
  children: (assistant: PetrinautAiAssistant) => ReactNode;
}) => {
  const host = use(BrunchAssistantContext);
  const show = host?.show;
  // Before paint, so the host's assistant replaces this frame unseen.
  useLayoutEffect(() => show?.(documentId), [show, documentId]);

  if (host === null) {
    throw new Error("BrunchAssistantContext has no provider above <Petrinaut>");
  }
  return host.assistant === null ? (
    <p className={connectingStyle} role="status">
      Connecting to Brunch…
    </p>
  ) : (
    children(host.assistant)
  );
};

/**
 * Renders Brunch's chat as the editor's assistant, and hands its `api` to
 * Brunch's cards.
 */
const useBrunchPlugin: PluginHook<typeof BrunchPlugin> = (api) => {
  // The empty-net prompt's text, which the chat consumes once.
  const [promptText, setPromptText] = useState<string | null>(null);

  return {
    provides: api,
    assistant: {
      content: (
        <BrunchAssistantContent documentId={api.document.id}>
          {(assistant) => (
            <AiAssistantPanel
              aiAssistant={assistant}
              api={api}
              initialMessage={promptText}
              onInitialMessageConsumed={() => setPromptText(null)}
              // Text from the prompt selects text, as the built-in chat's did,
              // so it never reaches a Voice mode left from an earlier session.
              initialInteractionMode={promptText === null ? null : "text"}
              onInitialInteractionModeConsumed={() => setPromptText(null)}
            />
          )}
        </BrunchAssistantContent>
      ),
      // The prompt offers text only; Voice starts from the chat's composer.
      onPrompt: setPromptText,
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

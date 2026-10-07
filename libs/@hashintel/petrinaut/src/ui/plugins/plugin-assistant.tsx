/**
 * The assistant the editor shows: the plugin the provider resolved from the
 * running assistants and the user's choice, with the tabs and start actions
 * of the plugins extending it. Read by the assistant window, the empty-net
 * prompt, the switch commands and the selector in User settings.
 */

import { type ReactNode, use } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { useCommand } from "../../react/commands/command-registry";
import { SDCPNContext } from "../../react/state/sdcpn-context";
import { UserSettingsContext } from "../../react/state/user-settings-context";
import {
  AssistantWindowContext,
  chatTabId,
  type EditorAssistantWindowHost,
  PetrinautAssistantWindow,
} from "../views/Editor/assistant-window";
import { PluginBoundary } from "./plugin-boundary";
import { parentOf, runningAssistantsOf } from "./plugin-statuses";
import {
  type RunningPlugin,
  useActiveAssistantId,
  usePluginStatuses,
  useRunningPlugins,
  useRunningPluginsSelector,
} from "./plugins-provider";

import type {
  PluginAssistantStartAction,
  PluginAssistantTab,
} from "./define-petrinaut-plugin";

/** The active assistant's plugin, then the running plugins that extend it. */
const contributorsOf = (
  running: readonly RunningPlugin[],
  activeAssistantId: string | undefined,
): readonly RunningPlugin[] => {
  const provider = running.find(
    ({ manifest }) => manifest.id === activeAssistantId,
  );

  return provider === undefined
    ? []
    : [
        provider,
        ...running.filter(
          ({ manifest }) => parentOf(manifest)?.id === activeAssistantId,
        ),
      ];
};

const hasView = (contributors: readonly RunningPlugin[]): boolean =>
  (contributors[0]?.contributions.assistant?.view ?? null) !== null;

/**
 * Whether the shown assistant has a view for this document. While it has
 * none, the editor hides the window and every AI entry point.
 */
export const useHasActiveAssistant = (): boolean => {
  const activeAssistantId = useActiveAssistantId();

  return useRunningPluginsSelector((running) =>
    hasView(contributorsOf(running, activeAssistantId)),
  );
};

/** The start action the empty-net prompt offers: the first of the shown assistant's. */
export const useAssistantStartAction = ():
  | PluginAssistantStartAction
  | undefined => {
  const activeAssistantId = useActiveAssistantId();

  return useRunningPluginsSelector((running) =>
    contributorsOf(running, activeAssistantId)
      .flatMap(
        ({ contributions }) => contributions.assistant?.startActions ?? [],
      )
      .at(0),
  );
};

const failedViewStyle = css({
  padding: "4",
  color: "neutral.s90",
  fontSize: "sm",
});

/** Shown in place of an assistant's view that threw, so the window stays usable. */
const FailedAssistantView = () => (
  <PetrinautAssistantWindow>
    <p className={failedViewStyle} role="alert">
      The assistant stopped working. Reload the page to start it again.
    </p>
  </PetrinautAssistantWindow>
);

/** Throws `error` inside a plugin's boundary, which reports it under that plugin's id. */
const Fail = ({ error }: { error: Error }): never => {
  throw error;
};

/**
 * The contributors' tabs in order, each in its own boundary. A tab that
 * reuses the chat tab's id or another tab's is left out, and a boundary in
 * `refused` reports it under its plugin's id.
 */
const tabsOf = (contributors: readonly RunningPlugin[]) => {
  const ids = new Set([chatTabId]);
  const tabs: PluginAssistantTab[] = [];
  const refused: ReactNode[] = [];
  for (const { manifest, contributions } of contributors) {
    for (const tab of contributions.assistant?.tabs ?? []) {
      const boundary = {
        pluginId: manifest.id,
        place: "assistant-tab",
        contributionId: tab.id,
      } as const;
      if (ids.has(tab.id)) {
        refused.push(
          <PluginBoundary key={`${manifest.id}:${tab.id}`} {...boundary}>
            <Fail
              error={
                new Error(
                  `Petrinaut plugin "${manifest.id}" returned an assistant tab with id "${tab.id}", which ${tab.id === chatTabId ? "is the chat tab's id" : "another tab already has"}. Choose another id.`,
                )
              }
            />
          </PluginBoundary>,
        );
      } else {
        ids.add(tab.id);
        tabs.push({
          ...tab,
          content: <PluginBoundary {...boundary}>{tab.content}</PluginBoundary>,
        });
      }
    }
  }

  return { tabs, refused };
};

/**
 * The shown assistant's view in its window, once per document: the view and
 * each tab fail alone, a failed view leaves a window that says so, and a tab
 * whose id is taken is left out and reported.
 */
export const PluginAssistantWindow = ({
  host,
}: {
  host: EditorAssistantWindowHost;
}) => {
  const activeAssistantId = useActiveAssistantId();
  const contributors = contributorsOf(useRunningPlugins(), activeAssistantId);
  const { petriNetId } = use(SDCPNContext);
  const [provider] = contributors;
  const label = provider?.manifest.assistant?.label;
  const view = provider?.contributions.assistant?.view ?? null;
  if (provider === undefined || label === undefined || view === null) {
    return null;
  }
  const pluginId = provider.manifest.id;
  const { tabs, refused } = tabsOf(contributors);

  return (
    <AssistantWindowContext value={host.hostFor({ label, tabs })}>
      {refused}
      <PluginBoundary
        key={`${pluginId}:${petriNetId ?? "no-net"}`}
        pluginId={pluginId}
        place="assistant"
        fallback={<FailedAssistantView />}
      >
        {view}
      </PluginBoundary>
    </AssistantWindowContext>
  );
};

/** The running assistants and the shown one, for the selector in User settings. */
export const useAssistantChoice = () => {
  const { setAiAssistantId } = use(UserSettingsContext);

  return {
    assistants: runningAssistantsOf(usePluginStatuses()),
    /** The plugin id of the shown assistant; `undefined` while none runs. */
    activeId: useActiveAssistantId(),
    /** Records the user's choice by plugin id. */
    choose: setAiAssistantId,
  };
};

const AssistantSwitchCommand = ({
  assistant,
  choose,
}: {
  assistant: { readonly id: string; readonly label: string };
  choose: (pluginId: string) => void;
}) => {
  useCommand({
    id: `petrinaut.ai-assistant.use:${assistant.id}`,
    label: `Use the ${assistant.label} assistant`,
    category: "Editor",
    keywords: ["assistant", "ai", "switch", assistant.label],
    run: () => choose(assistant.id),
  });

  return null;
};

/** A palette command for each running assistant but the shown one, once two or more run. */
export const AssistantSwitchCommands = () => {
  const { assistants, activeId, choose } = useAssistantChoice();

  return assistants.length > 1
    ? assistants
        .filter(({ id }) => id !== activeId)
        .map((assistant) => (
          <AssistantSwitchCommand
            key={assistant.id}
            assistant={assistant}
            choose={choose}
          />
        ))
    : null;
};

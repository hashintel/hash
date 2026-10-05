import { css } from "@hashintel/ds-helpers/css";
import { createJsonDocHandle } from "@hashintel/petrinaut-core";

import { UserSettingsProvider } from "../../../../../../react/state/user-settings-provider";
import { definePetrinautPlugin } from "../../../../../plugins/define-petrinaut-plugin";
import { definePluginToken } from "../../../../../plugins/plugin-token";
import { PetrinautPluginsProvider } from "../../../../../plugins/plugins-provider";
import { FocusRoot, FocusStack } from "../../../../../worksheet/focus-stack";
import { PluginsSection } from "./plugins-section";

import type { PetrinautPlugin } from "../../../../../plugins/define-petrinaut-plugin";
import type { Meta, StoryObj } from "@storybook/react-vite";

const handle = createJsonDocHandle({
  id: "plugins-section-story",
  initial: {
    places: [],
    transitions: [],
    types: [],
    parameters: [],
    differentialEquations: [],
  },
});
const document = { id: handle.id, handle };

const Conversation = definePluginToken<{ active: boolean }>(
  "website.brunch.conversation",
);

const noIcon = <span />;

/** The demo site's plugins, with their ids, as the editor lists them. */
const demoPlugins: readonly PetrinautPlugin[] = [
  definePetrinautPlugin(
    {
      id: "website.sentry-feedback",
      name: "Sentry feedback",
      description:
        "A button in the viewport controls that opens Sentry's feedback form, to report a bug or suggest an improvement.",
      author: "HASH",
      buttons: {
        giveFeedback: { label: "Give feedback", place: "viewport-controls" },
      },
    },
    () => ({ buttons: { giveFeedback: { icon: noIcon } } }),
  ),
  definePetrinautPlugin(
    {
      id: "website.command-palette",
      name: "Command palette",
      description:
        "Press ⌘K or Ctrl+K, or the button at the end of the top bar, to search and run the editor's commands and the plugins' commands.",
      author: "HASH",
      buttons: {
        toggle: { label: "Command palette", place: "top-bar-end" },
      },
    },
    () => ({ root: <span />, buttons: { toggle: { icon: noIcon } } }),
  ),
  definePetrinautPlugin(
    {
      id: "website.walkthrough",
      name: "Welcome guide",
      description:
        "A short tour of the editor, simulations and the assistant, shown when the editor opens until it is dismissed.",
      author: "HASH",
      settings: {
        showOnInit: {
          type: "boolean",
          default: true,
          label: "Show welcome guide",
          section: "general",
        },
      },
    },
    () => ({ root: <span /> }),
  ),
  definePetrinautPlugin(
    {
      id: "website.petrinaut-ai",
      name: "Petrinaut AI",
      description:
        "Petrinaut's own assistant over the website's chat route, with the transcript saved per document in this browser.",
      author: "HASH",
      assistant: { label: "Petrinaut" },
    },
    () => ({ assistant: { chat: null } }),
  ),
  definePetrinautPlugin(
    {
      id: "website.brunch",
      name: "Brunch",
      description:
        "HASH's process agent: builds and revises the net from a conversation, runs experiments, and keeps a Ledger of what it did.",
      author: "HASH",
      assistant: { label: "Brunch" },
      provides: { conversation: Conversation },
    },
    () => ({
      assistant: { chat: null },
      provides: { conversation: { active: false } },
    }),
  ),
  definePetrinautPlugin(
    {
      id: "website.voice",
      name: "Voice",
      description:
        "Talk to Brunch instead of typing: live or realtime speech in, spoken answers and captions out.",
      author: "HASH",
      assistant: { extends: "website.brunch" },
      requires: { brunch: Conversation },
      flags: {
        voice: { default: true, label: "Voice" },
        realtime: { default: false, label: "Realtime transcription" },
      },
    },
    () => ({ assistant: {} }),
  ),
];

const brokenPlugin = definePetrinautPlugin(
  {
    id: "story.broken",
    name: "Broken example",
    description: "Throws while it starts, so the editor runs on without it.",
    author: "Storybook",
  },
  () => {
    throw new Error("This plugin fails on purpose.");
  },
);

const frameStyle = css({
  width: "[600px]",
  padding: "5",
  background: "neutral.s00",
  borderRadius: "xl",
});

const settingsKey = "petrinaut:user-settings";

/** Seeds the switched-off plugins for one story and restores the stored settings after it. */
const withDisabledPlugins = (disabledPluginIds: readonly string[]) => () => {
  const previous = localStorage.getItem(settingsKey);
  localStorage.setItem(settingsKey, JSON.stringify({ disabledPluginIds }));

  return () => {
    if (previous === null) localStorage.removeItem(settingsKey);
    else localStorage.setItem(settingsKey, previous);
  };
};

const PluginsSectionStory = ({
  plugins,
}: {
  plugins: readonly PetrinautPlugin[];
}) => (
  <UserSettingsProvider>
    <PetrinautPluginsProvider plugins={plugins} document={document}>
      <FocusRoot>
        <FocusStack axis="vertical">
          <div className={frameStyle}>
            <PluginsSection />
          </div>
        </FocusStack>
      </FocusRoot>
    </PetrinautPluginsProvider>
  </UserSettingsProvider>
);

const meta = {
  title: "User settings / Plugins",
  component: PluginsSectionStory,
  parameters: { layout: "centered" },
  args: { plugins: demoPlugins },
} satisfies Meta<typeof PluginsSectionStory>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Every plugin of the demo site running. */
export const AllRunning: Story = {
  beforeEach: withDisabledPlugins([]),
};

/** Brunch switched off: Voice, which requires it, says so and greys its switch. */
export const ProviderSwitchedOff: Story = {
  beforeEach: withDisabledPlugins(["website.brunch"]),
};

/** A plugin whose body throws is marked as not running; the others carry on. */
export const FailedPlugin: Story = {
  args: { plugins: [...demoPlugins, brokenPlugin] },
  beforeEach: withDisabledPlugins([]),
};

/** The section with no plugins. */
export const Empty: Story = {
  args: { plugins: [] },
  beforeEach: withDisabledPlugins([]),
};

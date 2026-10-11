import { css } from "@hashintel/ds-helpers/css";

import { UserSettingsProvider } from "../../../../../../react/state/user-settings-provider";
import { pluginService } from "../../../../../plugins/define-petrinaut-plugin";
import { FocusRoot, FocusStack } from "../../../../../worksheet/focus-stack";
import { PluginsTable } from "./plugins-section";

import type { PluginRowProps } from "./plugins-section/plugin-row";
import type { Meta, StoryObj } from "@storybook/react-vite";

const rows: readonly PluginRowProps[] = [
  {
    manifest: {
      id: "website.command-palette",
      name: "Command palette",
      description:
        "Press ⌘K or Ctrl+K, or the top-bar button, to search and run commands.",
      author: "HASH",
      buttons: { toggle: { label: "Command palette", place: "top-bar-end" } },
      root: true,
    },
    status: "on",
  },
  {
    manifest: {
      id: "website.walkthrough",
      name: "Welcome guide",
      description: "A short tour of the editor, shown until it is dismissed.",
      author: "HASH",
      settings: {
        showOnInit: { type: "boolean", default: true, label: "Show guide" },
      },
    },
    status: "off",
  },
  {
    manifest: {
      id: "example.net-summary",
      name: "Net summary",
      description: "Counts the net's places beside the title.",
      author: "Example",
      access: { document: "read" },
      topBarItems: { summary: { place: "top-bar-start" } },
      provides: pluginService<number>(),
    },
    status: "on",
  },
  {
    manifest: {
      id: "example.broken",
      name: "Broken example",
      description: "Throws while it starts, so the editor runs on without it.",
      author: "Example",
    },
    status: "failed",
  },
];

const frameStyle = css({
  width: "[600px]",
  padding: "5",
  background: "neutral.s00",
  borderRadius: "xl",
});

const PluginsSectionStory = ({
  rows: storyRows,
}: {
  rows: readonly PluginRowProps[];
}) => (
  <UserSettingsProvider>
    <FocusRoot>
      <FocusStack axis="vertical">
        <div className={frameStyle}>
          <PluginsTable rows={storyRows} />
        </div>
      </FocusStack>
    </FocusRoot>
  </UserSettingsProvider>
);

const meta = {
  title: "User settings / Plugins",
  component: PluginsSectionStory,
  parameters: { layout: "centered" },
  args: { rows },
} satisfies Meta<typeof PluginsSectionStory>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Running, switched-off and failed plugins; click a row to see what it contributes. */
export const Default: Story = {};

/** The section with no plugins. */
export const Empty: Story = { args: { rows: [] } };

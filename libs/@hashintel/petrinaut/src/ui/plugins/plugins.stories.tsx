import { useState } from "react";

import { Icon, Toggle } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { createJsonDocHandle } from "@hashintel/petrinaut-core";
import { sirModel } from "@hashintel/petrinaut-core/examples";

import { useCommand } from "../../react/commands/command-registry";
import { usePetrinautDefinition } from "../../react/hooks/use-document";
import { Petrinaut } from "../petrinaut";
import { definePetrinautPlugin } from "./plugin";
import { PetrinautPluginsProvider } from "./plugins-provider";

import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Plugins / Host plugin",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const panelStyle = css({
  padding: "3",
  fontSize: "sm",
  color: "neutral.s110",
  display: "flex",
  flexDirection: "column",
  gap: "2",
});

const toastStyle = css({
  position: "fixed",
  right: "4",
  bottom: "4",
  padding: "[8px 12px]",
  borderRadius: "md",
  backgroundColor: "neutral.s120",
  color: "neutral.s00",
  fontSize: "sm",
  zIndex: "modal",
});

/** A bottom-panel tab counting the net's entities, from the public hooks. */
const NetSummary = () => {
  const definition = usePetrinautDefinition();
  return (
    <div className={panelStyle}>
      <span>
        {definition.places.length} places, {definition.transitions.length}{" "}
        transitions, {definition.parameters.length} parameters.
      </span>
      <span>Rendered by the host plugin in the bottom panel.</span>
    </div>
  );
};

/** A left-sidebar section, and the note the top-bar item points at. */
const HostNotes = () => (
  <div className={panelStyle}>
    <span>Host-owned content in a collapsible sidebar section.</span>
  </div>
);

const settingRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  paddingX: "3",
  paddingY: "2.5",
  fontSize: "sm",
});

/** Rows of a Labs settings group; the dialog draws the group's frame. */
const HostLabsRows = () => {
  const [enabled, setEnabled] = useState(false);
  return (
    <div className={settingRowStyle}>
      <span>Host experiment</span>
      <Toggle
        aria-label="Host experiment"
        value={enabled}
        onChange={setEnabled}
      />
    </div>
  );
};

const greetCommandId = "story.host.greet";

/**
 * The plugin's component: mounted once inside the editor, it owns the
 * overlay state and declares the command the top-bar button runs.
 */
const HostGreeting = () => {
  const [shownAt, setShownAt] = useState<number | null>(null);
  useCommand({
    id: greetCommandId,
    label: "Show a greeting",
    category: "Host",
    run: () => setShownAt(Date.now()),
  });
  return shownAt === null ? null : (
    <output className={toastStyle}>
      Hello from the host plugin at {new Date(shownAt).toLocaleTimeString()}.
      <button type="button" onClick={() => setShownAt(null)}>
        Dismiss
      </button>
    </output>
  );
};

const hostPlugin = definePetrinautPlugin({
  id: "story.host",
  name: "Story host plugin",
  buttons: [
    {
      id: "story.host.greet-button",
      placement: "top-bar-end",
      label: "Greet",
      tooltip: "Runs the plugin's greeting command",
      icon: <Icon name="star" size="sm" />,
      command: greetCommandId,
    },
    {
      id: "story.host.viewport-button",
      placement: "viewport-controls",
      label: "Host action",
      icon: <Icon name="puzzlePiece" size="xs" />,
      // eslint-disable-next-line no-alert -- the story only shows where the button lands
      onClick: () => window.alert("A host button under the zoom controls."),
    },
  ],
  subViews: [
    {
      id: "story.host.summary",
      title: "Net summary",
      placement: "bottom-panel",
      tooltip: "Entity counts, from the host plugin.",
      component: NetSummary,
    },
    {
      id: "story.host.notes",
      title: "Host notes",
      placement: "left-sidebar",
      component: HostNotes,
      defaultCollapsed: true,
    },
  ],
  settingsGroups: [
    {
      id: "story.host.labs",
      section: "labs",
      title: "Host plugin",
      component: HostLabsRows,
    },
  ],
  component: HostGreeting,
});

const HostPluginEditor = () => {
  const [handle] = useState(() =>
    createJsonDocHandle({
      id: "plugins-story",
      initial: sirModel.petriNetDefinition,
    }),
  );
  return (
    <PetrinautPluginsProvider plugins={[hostPlugin]}>
      <div style={{ height: "100vh", width: "100vw" }}>
        <Petrinaut handle={handle} title="SIR model" />
      </div>
    </PetrinautPluginsProvider>
  );
};

export const WithHostPlugin: Story = {
  name: "Buttons, panels and a command from one plugin",
  render: () => <HostPluginEditor />,
};

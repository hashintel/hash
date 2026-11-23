import { useState } from "react";

import { Button, Icon } from "@hashintel/ds-components";

import {
  definePetrinautPlugin,
  type PluginHook,
} from "../plugins/define-petrinaut-plugin";
import { describeRefusal } from "../plugins/plugin-access";
import { EchoChat, PlaceCount } from "./story-plugin-parts";

const CounterPlugin = definePetrinautPlugin({
  id: "story.counter",
  name: "Counter",
  description: "Counts clicks at the end of the top bar.",
  author: "Storybook",
  topBarItems: { counter: { place: "top-bar-end" } },
});

const useCounterPlugin: PluginHook<typeof CounterPlugin> = () => {
  const [count, setCount] = useState(0);

  return {
    topBarItems: {
      counter: (
        <Button size="sm" variant="ghost" onClick={() => setCount(count + 1)}>
          {`Clicked ${count}`}
        </Button>
      ),
    },
  };
};

const NetSummaryPlugin = definePetrinautPlugin({
  id: "story.net-summary",
  name: "Net summary",
  description:
    "Shows the place count before the title, and lays the net out from the viewport controls.",
  author: "Storybook",
  access: { document: "write" },
  settings: {
    showCount: {
      type: "boolean",
      default: true,
      label: "Place count",
      description: "Show the number of places before the title.",
      section: "viewport",
    },
  },
  buttons: { layout: { label: "Lay out the net", place: "viewport-controls" } },
  topBarItems: { count: { place: "top-bar-start" } },
});

const useNetSummaryPlugin: PluginHook<typeof NetSummaryPlugin> = (api) => ({
  buttons: {
    layout: {
      icon: <Icon name="diagramProject" size="xs" />,
      onClick: () => {
        void api.document.edit.applyAutoLayout().then((result) => {
          if (!result.applied) {
            api.notifications.add({
              message: describeRefusal(result.reason),
              tone: "error",
            });
          }
        });
      },
    },
  },
  topBarItems: {
    count: api.settings.get("showCount") ? (
      <PlaceCount document={api.document} />
    ) : null,
  },
});

const BrokenPlugin = definePetrinautPlugin({
  id: "story.broken",
  name: "Broken example",
  description: "Throws while it starts, so the editor runs on without it.",
  author: "Storybook",
});

const useBrokenPlugin: PluginHook<typeof BrokenPlugin> = () => {
  throw new Error("The broken example plugin failed to start");
};

const EchoAssistantPlugin = definePetrinautPlugin({
  id: "storybook.echo-assistant",
  name: "Echo assistant",
  description: "Repeats what you send, to show an assistant plugin's panel.",
  assistant: true,
});

/** A top-bar counter, and a place count with a setting and a layout button. */
export const contributingPlugins = [
  CounterPlugin(useCounterPlugin),
  NetSummaryPlugin(useNetSummaryPlugin),
];

/** The contributing plugins, and one whose hook throws. */
export const pluginsWithOneBroken = [
  ...contributingPlugins,
  BrokenPlugin(useBrokenPlugin),
];

export const echoAssistantPlugin = EchoAssistantPlugin({
  assistant: { content: <EchoChat /> },
});

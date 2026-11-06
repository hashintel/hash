import { definePetrinautPlugin, type PluginHook } from "../plugin";
import { FpsCounter } from "./fps-counter-plugin/counter";

const FpsCounterPlugin = definePetrinautPlugin({
  id: "hash.fps",
  name: "Browser FPS",
  description: "Show browser frame rate and a short history of samples.",
  author: "HASH",
  settings: {
    showFps: {
      type: "boolean",
      default: false,
      label: "Show FPS counter",
      description: "Show browser frame rate and a short history of samples.",
    },
  },
  commands: {
    toggleFps: {
      label: "Toggle browser FPS",
      shortcut: "mod+shift+f",
      keywords: ["fps", "performance", "frames"],
    },
  },
  root: true,
});

const useFpsCounterPlugin: PluginHook<typeof FpsCounterPlugin> = (api) => {
  const showFps = api.settings.get("showFps");
  const toggle = () =>
    api.settings.set("showFps", !api.settings.get("showFps"));
  return {
    commands: { toggleFps: { run: toggle } },
    root: showFps ? (
      <FpsCounter onClose={() => api.settings.set("showFps", false)} />
    ) : null,
  };
};

export const fpsCounterPlugin = FpsCounterPlugin(useFpsCounterPlugin);

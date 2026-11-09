import { definePetrinautPlugin } from "../plugin";
import { FpsCounter } from "./fps-counter-plugin/counter";

export const fpsCounterPlugin = definePetrinautPlugin(
  {
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
  },
  (api) => ({
    commands: {
      toggleFps: {
        run: () => api.settings.set("showFps", !api.settings.get("showFps")),
      },
    },
    root: api.settings.get("showFps") ? (
      <FpsCounter onClose={() => api.settings.set("showFps", false)} />
    ) : null,
  }),
);

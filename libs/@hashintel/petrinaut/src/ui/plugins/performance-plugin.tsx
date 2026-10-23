import { ChartLineIcon } from "@hashintel/ds-icons";

import { definePetrinautPlugin, type PluginHook } from "../plugin";
import { PerformanceMonitor } from "./performance-plugin/panels";

const PerformancePlugin = definePetrinautPlugin({
  id: "hash.performance",
  name: "Performance",
  description:
    "Browser frame timing and plugin activity, collected while the FPS counter is visible.",
  author: "HASH",
  access: { performance: "read" },
  settings: {
    showFps: {
      type: "boolean",
      default: false,
      label: "Show FPS counter",
      description: "Show browser frame rate and a short history of samples.",
    },
    showInformation: {
      type: "boolean",
      default: false,
      label: "Expand performance details",
      description:
        "Expand the FPS counter to show frame timing and plugin activity.",
    },
  },
  commands: {
    toggleFps: {
      label: "Toggle performance monitor",
      keywords: ["fps", "performance", "frames", "plugins", "timing"],
    },
  },
  buttons: {
    toggleFps: {
      label: "Toggle performance monitor",
      place: "top-bar-end",
    },
  },
  root: true,
});

const usePerformancePlugin: PluginHook<typeof PerformancePlugin> = (api) => {
  const showFps = api.settings.get("showFps");
  const expanded = api.settings.get("showInformation");

  return {
    commands: {
      toggleFps: {
        run: () => api.settings.set("showFps", !api.settings.get("showFps")),
      },
    },
    buttons: {
      toggleFps: { icon: <ChartLineIcon />, command: "toggleFps" },
    },
    root: showFps ? (
      <PerformanceMonitor
        performance={api.performance}
        expanded={expanded}
        setExpanded={(value) => api.settings.set("showInformation", value)}
        onClose={() => api.settings.set("showFps", false)}
      />
    ) : null,
  };
};

export const performancePlugin = PerformancePlugin(usePerformancePlugin);

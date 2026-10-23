import { useEffect, useEffectEvent } from "react";

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
      shortcut: "mod+shift+f",
      keywords: ["fps", "performance", "frames", "plugins", "timing"],
    },
  },
  root: true,
});

const usePerformancePlugin: PluginHook<typeof PerformancePlugin> = (api) => {
  const showFps = api.settings.get("showFps");
  const expanded = api.settings.get("showInformation");

  const toggle = () =>
    api.settings.set("showFps", !api.settings.get("showFps"));
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (
      !event.defaultPrevented &&
      !event.isComposing &&
      !event.repeat &&
      !event.altKey &&
      event.metaKey !== event.ctrlKey &&
      event.shiftKey &&
      event.key.toLowerCase() === "f"
    ) {
      event.preventDefault();
      toggle();
    }
  });
  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return {
    commands: {
      toggleFps: {
        run: toggle,
      },
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

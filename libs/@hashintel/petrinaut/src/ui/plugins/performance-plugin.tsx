import { RiSpeedUpLine } from "react-icons/ri";

import { definePetrinautPlugin, type PluginHook } from "../plugin";
import { PerformancePanels } from "./performance-plugin/panels";

const PerformancePlugin = definePetrinautPlugin({
  id: "hash.performance",
  name: "Performance",
  description:
    "Browser frame timing and plugin activity, collected while a performance panel is visible.",
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
      label: "Show performance information",
      description:
        "Show frame gaps, plugin activity, and available React timings.",
    },
  },
  commands: {
    toggleFps: {
      label: "Toggle FPS counter",
      keywords: ["performance", "frames"],
    },
    toggleInformation: {
      label: "Toggle performance information",
      keywords: ["performance", "plugins", "timing"],
    },
  },
  buttons: {
    toggleInformation: {
      label: "Toggle performance information",
      place: "top-bar-end",
    },
  },
  root: true,
});

const usePerformancePlugin: PluginHook<typeof PerformancePlugin> = (api) => {
  const showFps = api.settings.get("showFps");
  const showInformation = api.settings.get("showInformation");

  return {
    commands: {
      toggleFps: {
        run: () => api.settings.set("showFps", !api.settings.get("showFps")),
      },
      toggleInformation: {
        run: () =>
          api.settings.set(
            "showInformation",
            !api.settings.get("showInformation"),
          ),
      },
    },
    buttons: {
      toggleInformation: {
        icon: <RiSpeedUpLine />,
        command: "toggleInformation",
      },
    },
    root:
      showFps || showInformation ? (
        <PerformancePanels
          performance={api.performance}
          showFps={showFps}
          showInformation={showInformation}
          setShowFps={(value) => api.settings.set("showFps", value)}
          hideInformation={() => api.settings.set("showInformation", false)}
        />
      ) : null,
  };
};

export const performancePlugin = PerformancePlugin(usePerformancePlugin);

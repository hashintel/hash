import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  // Serves the favicon (hash.ai logo recolored to black)
  staticDirs: ["./static"],
  core: {
    disableTelemetry: true,
    disableWhatsNewNotifications: true,
    enableCrashReports: false,
  },
  features: {
    sidebarOnboardingChecklist: false,
  },
};

export default config;

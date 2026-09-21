import type { MenuItem } from "@hashintel/ds-components";

export const shouldShowBrunchCreateNew = ({
  brunchDemoMode,
  hasAiAssistant,
}: {
  brunchDemoMode: boolean;
  hasAiAssistant: boolean;
}): boolean => brunchDemoMode && hasAiAssistant;

export const createNewNetMenuItem = ({
  showBrunchOptions,
  onBuildWithBrunch,
  onStartBlank,
}: {
  showBrunchOptions: boolean;
  onBuildWithBrunch: () => void;
  onStartBlank: () => void;
}): MenuItem => {
  if (!showBrunchOptions) {
    return {
      id: "new",
      text: "New",
      onClick: onStartBlank,
    };
  }

  return {
    id: "new",
    text: "New",
    subItems: [
      {
        id: "new-build-with-brunch",
        text: "Build with Brunch",
        onClick: onBuildWithBrunch,
      },
      {
        id: "new-start-blank",
        text: "Start blank",
        onClick: onStartBlank,
      },
    ],
  };
};

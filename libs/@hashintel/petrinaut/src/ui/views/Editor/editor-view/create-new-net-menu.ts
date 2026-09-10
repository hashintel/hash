import type { MenuItem } from "@hashintel/ds-components";

export const createNewNetMenuItem = ({
  hasAiAssistant,
  onBuildWithBrunch,
  onStartBlank,
}: {
  hasAiAssistant: boolean;
  onBuildWithBrunch: () => void;
  onStartBlank: () => void;
}): MenuItem => {
  if (!hasAiAssistant) {
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

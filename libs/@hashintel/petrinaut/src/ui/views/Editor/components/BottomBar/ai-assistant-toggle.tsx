import { use } from "react";

import { EditorContext } from "../../../../../react/state/editor-context";
import { AiAssistantIcon } from "../../../../components/ai-assistant-icon";
import { ToolbarButton } from "./toolbar-button";

/** Opens and closes the AI assistant panel. */
export const AiAssistantToggle: React.FC = () => {
  const { isAiAssistantOpen, toggleAiAssistant } = use(EditorContext);
  const label = isAiAssistantOpen ? "Hide AI assistant" : "Show AI assistant";

  return (
    <ToolbarButton
      tooltip={label}
      onClick={toggleAiAssistant}
      isSelected={isAiAssistantOpen}
      ariaLabel={label}
      ariaExpanded={isAiAssistantOpen}
    >
      <AiAssistantIcon size={18} />
    </ToolbarButton>
  );
};

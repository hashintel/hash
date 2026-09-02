import {
  ASK_TOOL_NAME,
  parseBrunchAskInput,
  parseBrunchAskOutput,
} from "@hashintel/brunch-agent/client-tools";
import { definePetrinautAiInteractiveTool } from "@hashintel/petrinaut/ui";

import { BrunchAskWidget } from "./brunch-ask-widget";
import { brunchAskFromComposerText } from "./brunch-ask-mapping";

export const brunchAskInteractiveTool = definePetrinautAiInteractiveTool({
  toolName: ASK_TOOL_NAME,
  inputSchema: { parse: parseBrunchAskInput },
  outputSchema: { parse: parseBrunchAskOutput },
  fromComposerText: brunchAskFromComposerText,
  supportsSubmittedOutputProvenance: true,
  component: BrunchAskWidget,
});

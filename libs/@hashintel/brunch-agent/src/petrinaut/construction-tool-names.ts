import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import type { PetrinautAiToolName } from "@hashintel/petrinaut-core/ai";

export const CANONICAL_PETRINAUT_TOOL_NAMES = Object.keys(
  petrinautAiTools,
) as PetrinautAiToolName[];

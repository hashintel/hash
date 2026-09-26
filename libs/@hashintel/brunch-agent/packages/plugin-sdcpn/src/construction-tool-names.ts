import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

export const CANONICAL_PETRINAUT_TOOL_NAMES = Object.keys(
  petrinautAiTools,
) as (keyof typeof petrinautAiTools)[];

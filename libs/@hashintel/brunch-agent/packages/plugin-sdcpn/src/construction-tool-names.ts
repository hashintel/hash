import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

export const READ_PETRINAUT_DOCS_TOOL_NAME = "read_petrinaut_docs";

export const CANONICAL_PETRINAUT_TOOL_NAMES = Object.keys(
  petrinautAiTools,
) as (keyof typeof petrinautAiTools)[];

import type { CompareLlmResponseConfig } from "./types.js";

/**
 * This is a template configuration for the `compare-llm-response` script.
 *
 * To run the script:
 * 1. Copy this file into the `/var/config` directory, and specify the `llmParams` and `models` fields
 * 2. Rename the file to CONFIG_NAME.config.ts
 * 3. Run the script via: `yarn workspace @apps/hash-ai-worker-ts compare-llm-response CONFIG_NAME`.
 */

export const config: CompareLlmResponseConfig = {
  models: [
    /** Insert the models you want to use */
  ],
  // @ts-expect-error - the developer needs to provide the LLM parameters
  llmParams: {
    /** Insert the LLM parameters you want to use */
  },
};

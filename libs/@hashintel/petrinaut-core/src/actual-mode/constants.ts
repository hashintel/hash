export const ACTUAL_MODE_TIMELINE_TICK_MS = 500;

/**
 * The recording version new exports are written with. Version 3 firings carry
 * token values (`inputTokens` / `outputTokens`) only. Version 1 firings carry
 * `input` / `output` token counts, version 2 firings carry counts and
 * optionally token values; both load by normalizing the counts to token
 * values.
 */
export const ACTUAL_MODE_RECORDING_VERSION = 3;

export const SUPPORTED_ACTUAL_MODE_RECORDING_VERSIONS = [1, 2, 3] as const;

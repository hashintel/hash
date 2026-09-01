export const ACTUAL_MODE_TIMELINE_TICK_MS = 500;

/**
 * The recording version new exports are written with. Version 2 added
 * optional per-firing token values (`inputTokens` / `outputTokens`);
 * version-1 recordings still parse and simply carry none.
 */
export const ACTUAL_MODE_RECORDING_VERSION = 2;

export const SUPPORTED_ACTUAL_MODE_RECORDING_VERSIONS = [1, 2] as const;

/**
 * Shared constants for HASH AI Agent (Mastra-based).
 *
 * Centralizes configuration values used across agents, scorers, and workflows.
 */

import type { ModelForProvider } from '@mastra/core/llm/model';

export type OpenRouterModelId = `openrouter/${ModelForProvider<'openrouter'>}`;

/**
 * Default LLM model identifier for agent inference.
 *
 * Uses OpenRouter routing to Google's Gemini 2.5 Flash Lite model.
 */
export const DEFAULT_MODEL = 'openrouter/google/gemini-2.5-flash-lite' as const satisfies OpenRouterModelId;

/**
 * Block Protocol property type URL for entity names.
 *
 * Used as the canonical key for extracting/matching person and organization names
 * in structured entity output.
 */
export const NAME_PROPERTY_SCHEMA = 'https://blockprotocol.org/@blockprotocol/types/property-type/name/';

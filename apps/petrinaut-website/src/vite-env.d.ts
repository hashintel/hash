/// <reference types="vite/client" />

declare const __SENTRY_DSN__: string | undefined;
declare const __ENVIRONMENT__: string;

interface ImportMetaEnv {
  readonly VITE_BRUNCH_CHAT_ENDPOINT?: string;
  readonly VITE_PETRINAUT_DEFAULT_ASSISTANT?: string;
  /** PROTOTYPE ONLY — remove before any PR (see kanban-prototype-defaults.ts). */
  readonly VITE_KANBAN_PROTOTYPE_DEFAULTS?: string;
}

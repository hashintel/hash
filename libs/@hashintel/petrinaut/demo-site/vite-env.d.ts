/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly SENTRY_DSN?: string;
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

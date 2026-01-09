/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly SENTRY_DSN?: string;
  readonly ENVIRONMENT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

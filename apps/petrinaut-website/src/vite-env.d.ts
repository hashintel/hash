/// <reference types="vite/client" />

declare const __SENTRY_DSN__: string | undefined;
declare const __ENVIRONMENT__: string;

interface ImportMetaEnv {
  readonly VITE_PETRINAUT_OPT_PROVIDER?: "service";
}

/**
 * The frontend's `moduleResolution: "node"` ignores package `exports`, so
 * TypeScript cannot find this subpath's own types. Webpack resolves it at
 * runtime. Matches `@stll/folio-core/dist/i18n/messages.d.ts`.
 */
declare module "@stll/folio-react/messages" {
  import type { AbstractIntlMessages } from "use-intl";

  export const getFolioMessages: (locale: string) => AbstractIntlMessages;
}

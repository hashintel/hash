import type { BrowserOptions } from "@sentry/browser";

const piiKeySnippets = ["forwarded", "-ip", "remote-", "via", "-user"];

/**
 * The data the Sentry SDK collected when `sendDefaultPii` was unset, before
 * `dataCollection` replaced that option. Leaving `dataCollection` unset now
 * collects more: user info, cookies, request bodies and AI inputs and outputs.
 */
export const sentryDataCollectionWithoutDefaultPii = {
  userInfo: false,
  cookies: { deny: piiKeySnippets },
  httpHeaders: {
    request: { deny: piiKeySnippets },
    response: { deny: piiKeySnippets },
  },
  httpBodies: [],
  urlQueryParams: { deny: piiKeySnippets },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  frameContextLines: 7,
} satisfies BrowserOptions["dataCollection"];

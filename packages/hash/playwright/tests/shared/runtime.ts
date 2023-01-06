import { expect, test as base } from "@playwright/test";

const tolerableConsoleMessageMatches: RegExp[] = [
  /Download the Apollo DevTools for a better development experience/,
  /Download the React DevTools for a better development experience/,
  /\[Fast Refresh\]/, // Next.js dev server (for local test runs)
  /^\[LATE_SETUP_CALL\] \{\}/, // Tailwind (to be removed)
  /^Build: commit-.*-local-dev$/, // Sentry build id

  // You can add temporarily add more RegExps, but please track their removal
  /Failed to load resource: the server responded with a status of 401 \(Unauthorized\)/,
];

export * from "@playwright/test";

/**
 * This is a wrapper around the Playwright test function that adds checks for console messages.
 * @see https://github.com/microsoft/playwright/discussions/11690#discussioncomment-2060397
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const messages: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (tolerableConsoleMessageMatches.some((match) => match.test(text))) {
        return;
      }
      messages.push(`[${msg.type()}] ${msg.text()}`);
    });
    await use(page);
    expect(messages).toStrictEqual([]);
  },
});

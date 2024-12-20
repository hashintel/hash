import type { Page } from "@playwright/test";
import { expect, test as base } from "@playwright/test";

const tolerableConsoleMessageMatches: RegExp[] = [
  /Download the Apollo DevTools for a better development experience/,
  /Download the React DevTools for a better development experience/,
  /\[Fast Refresh\]/, // Next.js dev server (for local test runs)
  /^\[LATE_SETUP_CALL\] \{\}/, // Tailwind (to be removed)
  /^Build: commit-.*-local-dev$/, // Sentry build id

  // You can add temporarily add more RegExps, but please track their removal
  /Failed to load resource: the server responded with a status of 401 \(Unauthorized\)/,
  /No validator provided for shape type bpBlock/, // canvas page warning from TLDraw
];

export * from "@playwright/test";

/**
 * This is a wrapper around the Playwright test function that adds checks for console messages.
 * @see https://github.com/microsoft/playwright/discussions/11690#discussioncomment-2060397
 */
export const test = base.extend<Page>({
  page: async ({ page }, use) => {
    const messages: string[] = [];

    page.on("console", (msg) => {
      const text = msg.text();
      if (tolerableConsoleMessageMatches.some((match) => match.test(text))) {
        return;
      }

      messages.push(`[${msg.type()}] ${msg.text()}`);
    });
    // @todo: https://linear.app/hash/issue/H-3769/investigate-new-eslint-errors
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
    expect(
      messages,
      "Unexpected browser console messages during test",
    ).toStrictEqual([]);
  },
});

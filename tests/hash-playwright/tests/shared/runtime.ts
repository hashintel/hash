import type { Page } from "@playwright/test";
import { expect, test as base } from "@playwright/test";

const tolerableConsoleMessageMatches: RegExp[] = [
  /Download the Apollo DevTools for a better development experience/,
  /Download the React DevTools for a better development experience/,
  /\[Fast Refresh\]/, // Next.js dev server (for local test runs)
  /^\[LATE_SETUP_CALL\] \{\}/, // Tailwind (to be removed)
  /^Build: commit-.*-local-dev$/, // Sentry build id

  // You can add temporarily add more RegExps, but please track their removal
  /No validator provided for shape type bpBlock/, // canvas page warning from TLDraw
];

/**
 * HTTP 4xx responses that are a normal part of some flow and should not
 * cause a test to fail. The browser automatically emits a "Failed to load
 * resource" console error for any 4xx response, so these entries silence
 * that console noise — scoped by URL so a real 4xx from an unrelated
 * endpoint still flags the test.
 */
const tolerableResponseErrors: Array<{ status: number; urlPattern: RegExp }> = [
  // Whoami check before the user is authenticated.
  { status: 401, urlPattern: /\/auth\/sessions\/whoami$/ },
  // Kratos returns 422 with `browser_location_change_required` to signal
  // that the current login flow needs to upgrade (e.g. AAL2 required for
  // a TOTP-enabled user submitting password-only login).
  { status: 422, urlPattern: /\/auth\/self-service\/login(\?|$)/ },
  // Recovery code submission: Kratos returns 422 to redirect to the
  // settings page after a successful recovery code validation.
  { status: 422, urlPattern: /\/auth\/self-service\/recovery(\?|$)/ },
  // Kratos rejects expected self-service conditions: invalid TOTP/backup
  // codes, `session_already_available` when hitting the login browser
  // endpoint with an active session, expired flows, ...
  { status: 400, urlPattern: /\/auth\/self-service\// },
];

export * from "@playwright/test";

/**
 * This is a wrapper around the Playwright test function that adds checks for console messages.
 * @see https://github.com/microsoft/playwright/discussions/11690#discussioncomment-2060397
 */
export const test = base.extend<Page>({
  page: async ({ page }, use) => {
    const messages: string[] = [];

    // Browser "Failed to load resource" console messages only carry the
    // status code, not the URL. We correlate them with the actual
    // responses (which do have URLs) by counting credits: each tolerated
    // 4xx response grants one matching console-error suppression.
    const toleratedFailuresByStatus = new Map<number, number>();

    page.on("response", (res) => {
      const status = res.status();
      if (status < 400) {
        return;
      }
      const ok = tolerableResponseErrors.some(
        (entry) => entry.status === status && entry.urlPattern.test(res.url()),
      );
      if (ok) {
        toleratedFailuresByStatus.set(
          status,
          (toleratedFailuresByStatus.get(status) ?? 0) + 1,
        );
      }
    });

    page.on("console", (msg) => {
      const text = msg.text();
      if (tolerableConsoleMessageMatches.some((match) => match.test(text))) {
        return;
      }

      const resourceFailure = text.match(
        /Failed to load resource: the server responded with a status of (\d+)/,
      );
      if (resourceFailure) {
        const status = Number(resourceFailure[1]);
        const remaining = toleratedFailuresByStatus.get(status) ?? 0;
        if (remaining > 0) {
          toleratedFailuresByStatus.set(status, remaining - 1);
          return;
        }
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

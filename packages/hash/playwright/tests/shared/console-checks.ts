import { Page } from "playwright";

const tolerableConsoleMessageMatches: RegExp[] = [
  /Download the Apollo DevTools for a better development experience/,
  /^\[LATE_SETUP_CALL\] \{\}/, // Tailwind (to be removed)
  /^Build: commit-.*-local-dev$/, // Sentry build id
  /Unexpected console output MUI: You have provided a `title` prop to the child of/, // Temp error
];

export const failOnConsoleOutput = (
  page: Page,
  additionalTolerableConsoleMessageMatches: RegExp[] = [],
) => {
  page.on("console", (consoleMessage) => {
    const consoleMessageText = consoleMessage.text();

    for (const tolerableConsoleMessageText of [
      ...tolerableConsoleMessageMatches,
      ...additionalTolerableConsoleMessageMatches,
    ]) {
      if (consoleMessageText.match(tolerableConsoleMessageText)) {
        return;
      }
    }
    throw new Error(`Unexpected console output ${consoleMessageText}`);
  });
};

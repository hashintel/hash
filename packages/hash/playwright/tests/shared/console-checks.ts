import { Page } from "playwright";

const tolerableConsoleMessageMatches: RegExp[] = [
  /Download the React DevTools for a better development experience/,
  /Download the Apollo DevTools for a better development experience/,
  /^\[LATE_SETUP_CALL\] \{\}/, // Tailwind (to be removed)
  /^Build: commit-.*-local-dev$/, // Sentry build id
  /\[DOM\] Input elements should have autocomplete attributes \(suggested: "current-password"\)/, // Temp error
  /Failed to load resource: the server responded with a status of 401 \(Unauthorized\)/, // Temp error
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

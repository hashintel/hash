import { writeFile } from "node:fs/promises";

import { submitPersonaBrowserTurn } from "../browser-turn.ts";

import type { Page } from "@playwright/test";

/** Create through the normal UI and capture only the native attachment fields. */
export const openPersonaConversation = async (
  page: Page,
  origin: string,
  opening: string,
  options: {
    route?: string;
    sessionPath?: string;
    signal?: AbortSignal;
  } = {},
) => {
  await page.goto(new URL(options.route ?? "/", origin).href);
  const skipTour = page.getByRole("button", { name: "Skip tour" });
  await skipTour.waitFor();
  await skipTour.click();
  await page
    .getByRole("button", { name: "Show AI assistant", exact: true })
    .click();
  return submitPersonaBrowserTurn(page, opening, {
    signal: options.signal,
    onAdmission: async (session) => {
      // Retain the admitted identity even if its response fails; never resend it.
      if (options.sessionPath)
        await writeFile(
          options.sessionPath,
          `${JSON.stringify(session, null, 2)}\n`,
          { mode: 0o600 },
        );
    },
  });
};

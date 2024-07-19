import type { InitializeContext } from "../../context/initialize.js";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 100;

export const fetchTypeAsJson = async (
  versionedUrl: string,
  context: InitializeContext,
) => {
  for (let retry = 0; retry < MAX_RETRIES; retry++) {
    const delay = RETRY_DELAY_MS * retry;

    // This will be 0 for the first iteration, a bit superfluous but keeps the code logic simple
    await new Promise((resolve) => {
      setTimeout(resolve, delay);
    });

    try {
      const response = await fetch(versionedUrl, {
        headers: {
          accept: "application/json",
        },
      });

      if (!response.ok) {
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return await response.json();
    } catch (error) {
      if (retry === MAX_RETRIES - 1) {
        context.logWarn(`Could not fetch ${versionedUrl}`);
        throw error;
      }
    }
  }
};

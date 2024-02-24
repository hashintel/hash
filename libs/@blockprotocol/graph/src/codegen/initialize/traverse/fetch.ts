import fetch from "node-fetch";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 100;

export const fetchTypeAsJson = async (versionedUrl: string) => {
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

      return await response.json();
    } catch (err) {
      if (retry === MAX_RETRIES - 1) {
        throw err;
      }
    }
  }
};

import fs from "node:fs/promises";
import path from "node:path";

import { monorepoRootDir } from "@hashintel/hash-backend-utils/environment";
import { sleep } from "@hashintel/hash-shared/sleep";
import { loadAll } from "js-yaml";

const emailDumpsFilePath = path.resolve(
  monorepoRootDir,
  "var/api/dummy-email-transporter/email-dumps.yml",
);

const sharedErrorMessage =
  "Please make sure that the API server is running and that it uses DummyEmailTransporter. The test needs to dispatch an email first.";

const waitForRecentFileChange = async (
  filePath: string,
  minFileChangeTimestamp: number,
) => {
  const maxWaitTimeInMs = 5000;
  const checkIntervalInMs = 50;

  let remainingWaitTime = maxWaitTimeInMs;
  do {
    try {
      if ((await fs.stat(filePath)).mtimeMs >= minFileChangeTimestamp) {
        return;
      }
    } catch {
      // noop because fs.stat will be retried
    }
    await sleep(checkIntervalInMs);
    remainingWaitTime -= checkIntervalInMs;
  } while (remainingWaitTime > 0);
  throw new Error(
    `Expected ${filePath} to be modified since timestamp ${minFileChangeTimestamp}. Giving up after ${maxWaitTimeInMs}ms.`,
  );
};

/**
 * Reads email dumps created by DummyEmailTransporter and returns derived payload
 * from the most recent email.
 *
 * @param emailDispatchTimestamp If defined, the function waits for the dump
 *   to be written after the provided value. This helps avoid race conditions
 *   in tests, e.g. requesting a fresh login code but reading the old one.
 *   An alternative would be to introduce a fixed delay, which can slow down tests.
 */
export const getDerivedPayloadFromMostRecentEmail = async (
  emailDispatchTimestamp?: number,
): Promise<Record<string, unknown>> => {
  let emailDumps: unknown[];

  if (emailDispatchTimestamp) {
    await waitForRecentFileChange(emailDumpsFilePath, emailDispatchTimestamp);
  }

  try {
    emailDumps = loadAll(await fs.readFile(emailDumpsFilePath, "utf-8"));
  } catch (error) {
    throw new Error(
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `Unable to load email dumps from ${emailDumpsFilePath}. ${sharedErrorMessage}\n\n${error}`,
    );
  }

  const mostRecentEmailDump = emailDumps[0];

  if (!mostRecentEmailDump) {
    throw new Error(
      `No emails have been found in ${emailDumpsFilePath}. ${sharedErrorMessage}`,
    );
  }

  if (typeof mostRecentEmailDump !== "object") {
    throw new Error(
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `Expected most recent email to be an object, got ${mostRecentEmailDump}`,
    );
  }

  const { derivedPayload } = mostRecentEmailDump as Record<string, unknown>;

  if (typeof derivedPayload !== "object" || derivedPayload === null) {
    throw new Error(
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `Expected derivedPayload in most recent email to be an object, got ${derivedPayload}`,
    );
  }

  return derivedPayload as Record<string, unknown>;
};

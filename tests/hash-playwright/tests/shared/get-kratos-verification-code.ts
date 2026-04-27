import { sleep } from "@local/hash-isomorphic-utils/sleep";

type MailslurperMailAddress = {
  address?: string;
};

type MailslurperMailItem = {
  body?: string;
  dateSent?: string;
  subject?: string;
  toAddresses?: Array<string | MailslurperMailAddress>;
};

const extractToAddresses = (
  toAddresses: MailslurperMailItem["toAddresses"],
): string[] =>
  (toAddresses ?? [])
    .map((toAddress) => {
      if (typeof toAddress === "string") {
        return toAddress;
      }

      return toAddress.address;
    })
    .filter((toAddress): toAddress is string => typeof toAddress === "string");

const extractVerificationCode = (emailBody: string): string | undefined =>
  emailBody.match(/following code:\s*(?:<br\s*\/?>\s*)?(\d{6})/is)?.[1] ??
  emailBody.match(/\b(\d{6})\b/)?.[1];

/**
 * Mailslurper returns `dateSent` in its local time (UTC in our container) but
 * without any timezone indicator (format: `YYYY-MM-DD HH:MM:SS`). Parsing that
 * with `new Date(...)` treats it as *host* local time, which breaks the
 * timestamp filter on any developer machine not running in UTC. Normalise to
 * UTC by appending `Z` when no timezone is present.
 */
const parseMailslurperDate = (dateSent?: string): number | undefined => {
  if (!dateSent) {
    return undefined;
  }

  const hasTimezone = /[Zz]|[+-]\d{2}:?\d{2}$/.test(dateSent);
  const isoCandidate = hasTimezone
    ? dateSent
    : `${dateSent.replace(" ", "T")}Z`;

  const parsed = Date.parse(isoCandidate);
  return Number.isNaN(parsed) ? undefined : parsed;
};

/** Accept either the Kratos default subject or HASH's custom template. */
const isVerificationSubject = (subject?: string): boolean => {
  if (!subject) {
    return false;
  }
  return (
    subject === "Please verify your email address" ||
    subject.startsWith("Your HASH verification code:")
  );
};

const isRecoverySubject = (subject?: string): boolean =>
  typeof subject === "string" && subject.startsWith("Your HASH recovery code:");

/**
 * Poll mailslurper for a code email matching the given criteria.
 * Returns the 6-digit code on success, throws with diagnostics on timeout.
 */
const pollForKratosCode = async ({
  emailAddress,
  afterTimestamp,
  subjectFilter,
  extractCode,
  emailType,
}: {
  emailAddress: string;
  afterTimestamp?: number;
  subjectFilter: (subject?: string) => boolean;
  extractCode: (body: string) => string | undefined;
  emailType: string;
}): Promise<string> => {
  const maxWaitMs = 10_000;
  const pollIntervalMs = 250;
  const timestampBufferMs = 5_000;
  let elapsed = 0;
  let lastError: unknown;
  let lastMailItems: MailslurperMailItem[] | undefined;

  while (elapsed < maxWaitMs) {
    try {
      const response = await fetch("http://localhost:4437/mail");

      if (!response.ok) {
        throw new Error(
          `Unable to fetch emails from mailslurper: ${response.status} ${response.statusText}`,
        );
      }

      const data = (await response.json()) as {
        mailItems?: MailslurperMailItem[];
      };

      lastMailItems = data.mailItems;

      const matchingMailItems =
        data.mailItems
          ?.filter((mailItem) => {
            const sentTimestamp = parseMailslurperDate(mailItem.dateSent);

            return (
              subjectFilter(mailItem.subject) &&
              extractToAddresses(mailItem.toAddresses).includes(emailAddress) &&
              (!afterTimestamp ||
                (typeof sentTimestamp === "number" &&
                  sentTimestamp >= afterTimestamp - timestampBufferMs))
            );
          })
          .sort((a, b) => {
            const aTimestamp = parseMailslurperDate(a.dateSent) ?? 0;
            const bTimestamp = parseMailslurperDate(b.dateSent) ?? 0;

            return bTimestamp - aTimestamp;
          }) ?? [];

      for (const mailItem of matchingMailItems) {
        const code = mailItem.body ? extractCode(mailItem.body) : undefined;

        if (code) {
          return code;
        }
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(pollIntervalMs);
    elapsed += pollIntervalMs;
  }

  const lastErrorMessage =
    lastError instanceof Error ? ` Last error: ${lastError.message}` : "";

  const allItems = lastMailItems ?? [];
  const toTargetAddress = allItems.filter((item) =>
    extractToAddresses(item.toAddresses).includes(emailAddress),
  );
  const matchingSubject = toTargetAddress.filter((item) =>
    subjectFilter(item.subject),
  );
  const timestampFilteredOut =
    afterTimestamp !== undefined
      ? matchingSubject.filter((item) => {
          const sent = parseMailslurperDate(item.dateSent);
          return (
            typeof sent === "number" &&
            sent < afterTimestamp - timestampBufferMs
          );
        })
      : [];

  const diagnostics = [
    `Total emails in mailslurper: ${allItems.length}`,
    `Emails to ${emailAddress}: ${toTargetAddress.length}`,
    `${emailType} emails to ${emailAddress}: ${matchingSubject.length}`,
    afterTimestamp !== undefined
      ? `Filtered out by timestamp (sent before ${new Date(afterTimestamp - timestampBufferMs).toISOString()}, i.e. afterTimestamp ${new Date(afterTimestamp).toISOString()} minus ${timestampBufferMs}ms buffer): ${timestampFilteredOut.length}`
      : null,
    toTargetAddress.length > 0
      ? `Subjects to target: ${toTargetAddress.map((item) => JSON.stringify(item.subject)).join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("; ");

  throw new Error(
    `No ${emailType.toLowerCase()} email found for ${emailAddress} within ${maxWaitMs}ms.${lastErrorMessage} [${diagnostics}]`,
  );
};

export const getKratosVerificationCode = async (
  emailAddress: string,
  afterTimestamp?: number,
): Promise<string> =>
  pollForKratosCode({
    emailAddress,
    afterTimestamp,
    subjectFilter: isVerificationSubject,
    extractCode: extractVerificationCode,
    emailType: "Verification",
  });

export const getKratosRecoveryCode = async (
  emailAddress: string,
  afterTimestamp?: number,
): Promise<string> =>
  pollForKratosCode({
    emailAddress,
    afterTimestamp,
    subjectFilter: isRecoverySubject,
    extractCode: (body) => body.match(/\b(\d{6})\b/)?.[1],
    emailType: "Recovery",
  });

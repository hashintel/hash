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

export const getKratosVerificationCode = async (
  emailAddress: string,
  afterTimestamp?: number,
): Promise<string> => {
  const maxWaitMs = 10_000;
  const pollIntervalMs = 250;
  let elapsed = 0;
  let lastError: unknown;

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

      const matchingMailItems =
        data.mailItems
          ?.filter((mailItem) => {
            const sentTimestamp = mailItem.dateSent
              ? new Date(mailItem.dateSent).getTime()
              : undefined;

            return (
              mailItem.subject === "Please verify your email address" &&
              extractToAddresses(mailItem.toAddresses).includes(emailAddress) &&
              (!afterTimestamp ||
                (typeof sentTimestamp === "number" &&
                  sentTimestamp >= afterTimestamp))
            );
          })
          .sort((a, b) => {
            const aTimestamp = a.dateSent ? new Date(a.dateSent).getTime() : 0;
            const bTimestamp = b.dateSent ? new Date(b.dateSent).getTime() : 0;

            return bTimestamp - aTimestamp;
          }) ?? [];

      for (const mailItem of matchingMailItems) {
        const code = mailItem.body
          ? extractVerificationCode(mailItem.body)
          : undefined;

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

  throw new Error(
    `No verification email found for ${emailAddress} within ${maxWaitMs}ms.${lastErrorMessage}`,
  );
};

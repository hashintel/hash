import type { UiText } from "@ory/client";
import type { ReactNode } from "react";

export const providerDisplayNames: Record<string, string> = {
  google: "Google",
  apple: "Apple",
  microsoft: "Microsoft",
  github: "GitHub",
  gitlab: "GitLab",
};

/**
 * Formats a Kratos UI message for display, replacing machine-generated
 * messages with human-friendly versions where possible.
 */
export const formatKratosMessage = (message: UiText): ReactNode => {
  const context = message.context as Record<string, unknown> | undefined;

  // Recovery success (Kratos message 1060001):
  // Original: 'You successfully recovered your account. Please change your
  // password or set up an alternative login method (e.g. social sign in)
  // within the next X.XX minutes.'
  if (message.id === 1060001) {
    const expiresAt = (context?.privilegedSessionExpiresAt ??
      context?.privileged_session_expires_at) as string | undefined;

    let remainingMinutes: number | undefined;
    if (expiresAt) {
      remainingMinutes = Math.max(
        1,
        Math.round((new Date(expiresAt).getTime() - Date.now()) / 60_000),
      );
    }

    const timeWindow = remainingMinutes
      ? `${remainingMinutes} minute${remainingMinutes === 1 ? "" : "s"}`
      : "a few minutes";

    return `You successfully recovered your account. Please change your password within the next ${timeWindow}.`;
  }

  // Account linking (Kratos message 1010016):
  // Original: 'You tried to sign in with "email", but that email is already
  // used by another account...'
  if (message.id === 1010016 && context) {
    const email = (context.duplicateIdentifier ??
      context.duplicate_identifier) as string | undefined;
    const providerId = context.provider as string | undefined;
    const provider = providerId
      ? (providerDisplayNames[providerId] ?? providerId)
      : undefined;

    return (
      <>
        An account with {email ? <strong>{email}</strong> : "this email"}{" "}
        already exists. Sign in with your password to link{" "}
        {provider ? <strong>{provider}</strong> : "the external provider"} as
        another way to sign in.
      </>
    );
  }

  return message.text;
};

/**
 * The URL Sentry accepts browser security reports on, such as CSP
 * violations, for the project a DSN names, or `null` when the DSN can't be
 * parsed.
 *
 * A DSN `https://<key>@<host>[/<path>]/<projectId>` maps to
 * `https://<host>[/<path>]/api/<projectId>/security/?sentry_key=<key>`.
 *
 * @see https://docs.sentry.io/security-legal-pii/security/security-policy-reporting/
 */
export const sentrySecurityEndpoint = ({
  dsn,
  environment,
  release,
}: {
  dsn: string;
  environment?: string;
  release?: string;
}): string | null => {
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    return null;
  }

  const publicKey = url.username;
  const pathSegments = url.pathname.split("/").filter(Boolean);
  const projectId = pathSegments.pop();

  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    !publicKey ||
    !projectId ||
    !/^\d+$/.test(projectId)
  ) {
    return null;
  }

  const endpoint = new URL(
    `${[...pathSegments, "api", projectId, "security"].join("/")}/`,
    url.origin,
  );
  endpoint.searchParams.set("sentry_key", publicKey);
  if (environment) {
    endpoint.searchParams.set("sentry_environment", environment);
  }
  if (release) {
    endpoint.searchParams.set("sentry_release", release);
  }

  return endpoint.toString();
};

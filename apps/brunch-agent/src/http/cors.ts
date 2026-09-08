export const BRUNCH_CORS_ALLOWED_ORIGINS_ENV = "BRUNCH_CORS_ALLOWED_ORIGINS";

const invalidOriginConfiguration = (): Error =>
  new Error(
    `${BRUNCH_CORS_ALLOWED_ORIGINS_ENV} must contain only comma-separated exact HTTP(S) origins`,
  );

const normalizeCorsOrigin = (value: string): string => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalidOriginConfiguration();
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.hostname.includes("*") ||
    url.origin === "null"
  ) {
    throw invalidOriginConfiguration();
  }

  return url.origin;
};

export const parseCorsAllowedOrigins = (
  value: string | undefined,
): string[] => {
  if (value === undefined || value.trim() === "") {
    return [];
  }

  return [
    ...new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .map(normalizeCorsOrigin),
    ),
  ];
};

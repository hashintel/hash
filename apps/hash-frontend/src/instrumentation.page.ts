import * as Sentry from "@sentry/node";

export const register = async () => {
  await import("../sentry.server.config");
};

export const onRequestError = async (
  error: unknown,
  request: { method: string; path: string },
  context: unknown,
) => {
  Sentry.captureException(error, {
    extra: { method: request.method, path: request.path, context },
  });
  await Sentry.flush(2000);
};

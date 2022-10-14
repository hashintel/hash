export const frontendDomain = process.env.FRONTEND_DOMAIN ?? "localhost:3000";

/** @todo: figure out how to properly determine the base URL of workspace types */
export const frontendUrl = `http${
  process.env.HTTPS_ENABLED ? "s" : ""
}://${frontendDomain}`;

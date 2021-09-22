const FRONTEND_DOMAIN = process.env.FRONTEND_DOMAIN;

if (!FRONTEND_DOMAIN) {
  throw new Error(`environment variable FRONTEND_DOMAIN is required`);
}

/**
 * @todo store this config somehow/somewhere else
 */
module.exports = {
  FRONTEND_DOMAIN,
  FRONTEND_URL: `http://${FRONTEND_DOMAIN}`,
  SYSTEM_ACCOUNT_SHORTNAME: "hash",
  SYSTEM_ACCOUNT_NAME: "HASH",
};

/**
 * Sites where the useful content is gated behind an authentication or paywall,
 * in which case we log a request for the content to be picked up by the user's browser.
 *
 * The user may not have access to these sites, and there may be unlisted sites we hit walls for
 * which the user _does_ have access to. The best solution would be some way of knowing which
 * sites specific user(s) can access.
 *
 * @todo vary these based on knowledge about which sites users can help us with
 * @todo be able to detect other arbitrary sites which hit auth/paywalls (e.g. via looking for 401 status codes)
 */
export const defaultBrowserPluginDomains = ["linkedin.com"];

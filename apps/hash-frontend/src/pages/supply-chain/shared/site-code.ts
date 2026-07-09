/**
 * Canonical form of a site code, used to scope status updates and to
 * route/fetch a site's precomputed artifacts.
 */
export function normaliseSiteCode(code: string): string {
  return code.trim().toLowerCase();
}

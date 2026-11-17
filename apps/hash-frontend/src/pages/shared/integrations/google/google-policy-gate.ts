import { isGoogleIntegrationPath } from "../../../../lib/csp";

/**
 * Decides whether this document's policy lets Google's scripts load,
 * reloading it when it doesn't but a fresh load would.
 *
 * Only the routes {@link isGoogleIntegrationPath} matches allow Google, and a
 * document keeps the policy it was first loaded with, so reaching one of them
 * by client-side navigation leaves Google blocked. The document is reloaded
 * only when it is now at such a route, so a reload can't repeat.
 *
 * @returns whether to load Google's scripts.
 */
export const runGooglePolicyGate = ({
  documentPathname,
  currentPathname,
  reload,
}: {
  documentPathname: () => string | null;
  currentPathname: () => string;
  reload: () => void;
}): boolean => {
  const loadedAt = documentPathname();
  if (loadedAt === null || isGoogleIntegrationPath(loadedAt)) {
    return true;
  }
  if (isGoogleIntegrationPath(currentPathname())) {
    reload();
  }
  return false;
};

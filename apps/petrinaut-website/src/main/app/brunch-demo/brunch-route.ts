/**
 * This is temporary, until Petrinaut Demo app gets a real Router.
 * Adding a real Router will require to consider every parts of the app, so this is just a quick and dirty solution.
 */
export const isBrunchDemoRoute = (): boolean => {
  const path = window.location.pathname.replace(/\/+$/u, "") || "/";

  return path === "/brunch";
};

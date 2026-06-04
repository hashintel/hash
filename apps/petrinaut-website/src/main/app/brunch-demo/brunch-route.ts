export const isBrunchDemoRoute = (): boolean => {
  const path = window.location.pathname.replace(/\/+$/u, "") || "/";

  return path === "/brunch";
};

export const isOptimizationDemoRoute = (): boolean => {
  const path = window.location.pathname.replace(/\/+$/u, "") || "/";

  return path === "/optimization";
};

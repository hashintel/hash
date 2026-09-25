export const resolvePandaBuildInfoPath = (
  specifier: string,
  resolve: (specifier: string) => string,
  platform: NodeJS.Platform = process.platform,
) => {
  const path = resolve(specifier);

  return platform === "win32" ? path.replaceAll("\\", "/") : path;
};

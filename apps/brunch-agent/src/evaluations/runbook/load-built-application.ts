export interface BuiltBrunchApplication {
  readonly fetch: (request: Request) => Response | Promise<Response>;
  readonly stop: (timeoutMs?: number) => Promise<void>;
}

type BuiltApplicationModule = {
  readonly loadFlueNodeApplication?: () => Promise<BuiltBrunchApplication>;
};

/**
 * Load the non-listening production artifact. Keep the specifier computed so
 * TypeScript does not require generated `dist` declarations.
 */
export const loadBuiltBrunchApplication =
  async (): Promise<BuiltBrunchApplication> => {
    const applicationUrl = new URL("../../../dist/app.mjs", import.meta.url)
      .href;
    const builtModule = (await import(
      applicationUrl
    )) as BuiltApplicationModule;
    if (builtModule.loadFlueNodeApplication === undefined) {
      throw new Error("dist/app.mjs does not export loadFlueNodeApplication");
    }
    return builtModule.loadFlueNodeApplication();
  };

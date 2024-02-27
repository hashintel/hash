import init from "@blockprotocol/type-system-rs/pkg/type-system";

export type InitInput =
  | RequestInfo
  | URL
  | Response
  | BufferSource
  | WebAssembly.Module;

let wasmInit: (() => InitInput) | undefined = undefined;
export const setWasmInit = (arg: () => InitInput) => {
  wasmInit = arg;
};

let initialized: Promise<void> | undefined = undefined;
export class TypeSystemInitializer {
  private constructor() {}

  /**
   * Initializes the package. There is a one time global setup fee (sub 30ms), but subsequent
   * requests to initialize will be instantaneous, so it's not imperative to reuse the same parser.
   */
  public static initialize = async (options?: InitInput) => {
    if (initialized === undefined) {
      const loadModule = options ?? (wasmInit ? wasmInit() : undefined);
      initialized = init(loadModule).then(() => undefined);
    }

    await initialized;
    return new TypeSystemInitializer();
  };
}

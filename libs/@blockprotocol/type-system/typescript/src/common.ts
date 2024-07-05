import init from "@blockprotocol/type-system-rs";

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
      initialized = init.default(loadModule).then(() => undefined);
    }

    await initialized;
    return new TypeSystemInitializer();
  };
}

/**
 * Ensures that the array has at least one element. If not it returns `undefined`.
 *
 * @todo: Remove when Typescript can infer this
 * @see https://github.com/microsoft/TypeScript/issues/29841
 */
export const atLeastOne = <T>(array: T[]): [T, ...T[]] | undefined =>
  // @ts-expect-error –– @see https://github.com/microsoft/TypeScript/issues/29841
  array.length > 0 ? (array satisfies [T, ...T[]]) : undefined;

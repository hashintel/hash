export type WasmMemory = { readonly buffer: ArrayBuffer };

type WasmHost = {
  compile(bytes: Uint8Array<ArrayBuffer>): Promise<object>;
  instantiate(
    module: object,
    imports: Record<string, object>,
  ): Promise<{
    exports: Record<string, unknown>;
  }>;
};

export const getWasmHost = (): WasmHost | undefined =>
  (globalThis as typeof globalThis & { WebAssembly?: WasmHost }).WebAssembly;

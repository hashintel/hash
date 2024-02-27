import wasm from "../wasm/type-system_bg.wasm";
import { setWasmInit } from "./common";

export * from "../wasm/type-system";
export { TypeSystemInitializer } from "./common";
export * from "./native";

// @ts-expect-error -- The cause of this error is unknown, perhaps growing pains for the WASM ecosystem, or we need to do some custom TS declaration
setWasmInit(() => wasm());

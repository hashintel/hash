import wasm from "@blockprotocol/type-system-rs/type-system.wasm";

import { setWasmInit } from "./common";

export { TypeSystemInitializer } from "./common";
export * from "./native";
export * from "@blockprotocol/type-system-rs";

setWasmInit(() => wasm());

import wasm from "@blockprotocol/type-system-rs/wasm";

import { setWasmInit } from "./common";

export { atLeastOne, TypeSystemInitializer } from "./common";
export * from "./native";
export * from "@blockprotocol/type-system-rs";

setWasmInit(() => (typeof wasm === "function" ? wasm() : wasm));

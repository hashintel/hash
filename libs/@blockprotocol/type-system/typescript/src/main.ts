// Without the ?url query parameter, any project making using of `vite` (popular frontend tooling)
// will fail to compile. This will force the project to use a URL instead but shouldn't affect any other
// systems.
import wasm from "@blockprotocol/type-system-rs/type-system.wasm?url";

import { setWasmInit } from "./common";

export { TypeSystemInitializer } from "./common";
export * from "./native";
export * from "@blockprotocol/type-system-rs";

setWasmInit(() => (typeof wasm === "function" ? wasm() : wasm));

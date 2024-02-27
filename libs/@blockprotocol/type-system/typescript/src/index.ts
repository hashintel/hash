/* eslint-disable canonical/filename-no-index */
import wasm from "@blockprotocol/type-system-rs/pkg/type-system_bg.wasm";

import { setWasmInit } from "./common";

export { TypeSystemInitializer } from "./common";
export * from "./native";
export * from "@blockprotocol/type-system-rs/pkg/type-system";

// @ts-expect-error -- The cause of this error is unknown, perhaps growing pains for the WASM ecosystem, or we need to do some custom TS declaration
// eslint-disable-next-line @typescript-eslint/no-unsafe-return
setWasmInit(() => wasm());

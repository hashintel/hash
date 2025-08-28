// import wasm from "@blockprotocol/type-system-rs/wasm";
//
// import { setWasmInit } from "./common.js";

import type { EntityMetadata } from "./native/entity.js";

export {
  atLeastOne,
  mustHaveAtLeastOne,
} from "./common.js";
export * from "./native.js";
export * from "@blockprotocol/type-system-rs";
export * from "@blockprotocol/type-system-rs/types";

/**
 * This explicit re-export is necessary as we're overwriting EntityMetadata from @blockprotocol/type-system-rs,
 * and the explicit re-export removes the ambiguity of which EntityMetadata should be exported from here (local exports take priority)
 */
export type { EntityMetadata };

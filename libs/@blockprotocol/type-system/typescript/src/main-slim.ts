import type { EntityMetadata } from "./native/entity.js";

export { atLeastOne } from "./common.js";
export * from "./native.js";
export * from "@blockprotocol/type-system-rs";

/**
 * This explicit re-export is necessary as we're overwriting EntityMetadata from @blockprotocol/type-system-rs,
 * and the explicit re-export removes the ambiguity of which EntityMetadata should be exported (things defined in this module take priority)
 */
export type { EntityMetadata };

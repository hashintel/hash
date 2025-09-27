import type { Brand } from "@blockprotocol/type-system";

/**
 * The type-branding type to support opaque (name based) types
 */
export type Opaque<Kind extends string> = Brand<symbol, Kind>;

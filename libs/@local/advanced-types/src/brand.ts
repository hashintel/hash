import { Brand as EffectBrand } from "effect";


/**
 * The type-branding type to support nominal (name based) types.
 */
export type Brand<Base, Kind extends string | symbol> = Base & EffectBrand.Brand<Kind>;

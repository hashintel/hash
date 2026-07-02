/**
 * Tuning for the d3-force entity (dot) layout inside opened leaf clusters
 * ({@link "./entity-layout"}), including the shared settle threshold consumed
 * by {@link "./force-simulation"}.
 *
 * Kept separate from the engine so the main thread (root `config.ts`, the dev
 * harness) can import the defaults without pulling d3-force into the page
 * bundle.
 */
export interface EntityForceConfig {
  /** Gentle pull toward the bubble centre; collision does the real spacing. @defaultValue 0.05. */
  readonly centerStrength: number;
  /** Pull toward the external port target; blends with (does not erase) centre. @defaultValue 0.2. */
  readonly portAttractionStrength: number;
  /** d3 forceManyBody strength (negative repels). @defaultValue -1. */
  readonly chargeStrength: number;
  /** Distance (world units) beyond which the charge force is ignored. @defaultValue 50. */
  readonly chargeDistanceMax: number;
  /** Extra collision radius (world units) around each dot. @defaultValue 1. */
  readonly collidePadding: number;
  /** d3 forceCollide iterations per tick. @defaultValue 4. */
  readonly collideIterations: number;
  /** Link rest length as a multiple of the endpoints' combined radii. @defaultValue 2. */
  readonly linkDistanceMultiplier: number;
  /** Additive link rest-length padding (world units). @defaultValue 10. */
  readonly linkDistancePadding: number;
  /** Link strength per unit of link weight, capped at 1. @defaultValue 0.3. */
  readonly linkStrengthFactor: number;
  /** d3 alphaDecay: how fast the simulation cools. @defaultValue 0.015. */
  readonly alphaDecay: number;
  /** d3 velocityDecay: per-tick velocity damping. @defaultValue 0.35. */
  readonly velocityDecay: number;
  /**
   * Freeze a d3 layout once alpha drops to here.
   *
   * @defaultValue 0.001, d3's natural settle floor; 0.01 freezes before
   * collision forces finish separating the last overlaps.
   */
  readonly settleAlpha: number;
}

export const defaultEntityForceConfig: EntityForceConfig = {
  centerStrength: 0.05,
  portAttractionStrength: 0.2,
  chargeStrength: -1,
  chargeDistanceMax: 50,
  collidePadding: 1,
  collideIterations: 4,
  linkDistanceMultiplier: 2,
  linkDistancePadding: 10,
  linkStrengthFactor: 0.3,
  alphaDecay: 0.015,
  velocityDecay: 0.35,
  settleAlpha: 0.001,
};

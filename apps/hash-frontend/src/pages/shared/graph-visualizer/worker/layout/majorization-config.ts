/**
 * Tuning for the community-force flat tier's stress-majorization engine
 * ({@link "./majorization-layout"}): persistent-CG solves with
 * circle-relaxation projection and a verified-clean terminal settle.
 *
 * Kept separate from the engine so the main thread (root `config.ts`, the dev
 * harness) can import the defaults without pulling the engine's dependency
 * chain (graphology, Louvain) into the page bundle.
 *
 * The three shaping weights shape stress targets (community-scaled edge
 * lengths, hub halo bands, and the community-region floor margin), not force
 * terms; set a weight to 0 to disable that shaping.
 */
export interface MajorizationConfig {
  /**
   * Target graph-edge length in layout space (px per hop).
   *
   * @defaultValue 60. Lower values tighten the layout but raise packing
   * infeasibility risk on dense hubs; higher values spread components and
   * increase settle work.
   */
  readonly idealEdgeLength: number;
  /**
   * Extra gap between node disks: collision floors and the projector's pair gap.
   *
   * @defaultValue 8. Raising it airs the layout out at the cost of a larger
   * settled footprint.
   */
  readonly overlapPadding: number;
  /**
   * Same-community attraction: deflate same-community stress targets ÷(1 + 2·w).
   *
   * @defaultValue 0.02.
   */
  readonly communityCohesion: number;
  /**
   * Cross-community separation: inflate cross-community stress targets ×(1 + 2·w)
   * and widen the community-region floor margin (the keep-out disk every non-member
   * is held outside) by w·idealEdgeLength.
   *
   * @defaultValue 0.08.
   */
  readonly communitySeparation: number;
  /**
   * Hub breathing room: how far a packed hub's children are pushed from its rim
   * toward an explicit halo shell (band floor share min(1, 2·w)).
   *
   * @defaultValue 0.02.
   */
  readonly degreeRepulsion: number;
  /**
   * Hard majorization-iteration cap (logs "capped" and settles when reached).
   *
   * @defaultValue 150.
   */
  readonly maxIterations: number;
  /**
   * Converged when max per-iteration displacement < ε · idealEdgeLength for
   * {@link MajorizationConfig.convergenceStreak} iterations.
   *
   * @defaultValue 0.008.
   */
  readonly convergenceEpsilon: number;
  /**
   * Consecutive converged iterations required before the terminal settle runs.
   *
   * @defaultValue 2.
   */
  readonly convergenceStreak: number;
  /**
   * Conjugate-gradient steps allowed per majorization iteration.
   *
   * @defaultValue 120. Under-solving is not a saving: leftover disequilibrium
   * re-appears every iteration as sustained displacement.
   */
  readonly cgStepsPerIteration: number;
  /**
   * Pivot budget cap (stress terms ≈ pivots·nodes); the engine clamps it to
   * the node count.
   *
   * @defaultValue 64. More pivots hold the global shape better at linear
   * per-iteration cost.
   */
  readonly pivotCount: number;
}

export const defaultMajorizationConfig: MajorizationConfig = {
  idealEdgeLength: 60,
  overlapPadding: 8,
  communityCohesion: 0.02,
  communitySeparation: 0.08,
  degreeRepulsion: 0.02,
  maxIterations: 150,
  convergenceEpsilon: 8e-3,
  convergenceStreak: 2,
  cgStepsPerIteration: 120,
  pivotCount: 64,
};

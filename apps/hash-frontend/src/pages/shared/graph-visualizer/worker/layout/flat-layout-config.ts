/**
 * Tuning for the small-N flat tier's WebCola stress layout
 * ({@link "./flat-layout"}: stress -> pack -> overlap phases).
 *
 * Kept separate from the engine so the main thread (root `config.ts`, the dev
 * harness) can import the defaults without pulling WebCola into the page
 * bundle.
 */
export interface FlatForceConfig {
  /**
   * Base ideal link length (world units); jaccardLinkLengths scales it by structure.
   *
   * @defaultValue 40.
   */
  readonly idealLinkLength: number;
  /**
   * How strongly neighbourhood overlap warps ideal link lengths (WebCola's
   * jaccardLinkLengths weight).
   *
   * @defaultValue 1.
   */
  readonly jaccardWeight: number;
  /**
   * Non-overlap padding around each dot, in world units.
   *
   * @defaultValue 3.
   */
  readonly nodePadding: number;
  /**
   * Stress-convergence ratio threshold for the unconstrained phase (cola's own
   * default ratio test).
   *
   * @defaultValue 0.01.
   */
  readonly convergenceThreshold: number;
  /**
   * Safety cap on unconstrained stress iterations (guarantees phase termination).
   *
   * @defaultValue 200.
   */
  readonly stressMaxIterations: number;
  /**
   * Guaranteed base of overlap (VPSC) iterations before the convergence test
   * may stop the phase.
   *
   * @defaultValue 40.
   */
  readonly overlapMinIterations: number;
  /**
   * Safety cap on overlap (VPSC) iterations.
   *
   * @defaultValue 400.
   */
  readonly overlapMaxIterations: number;
  /**
   * Fallback node size (world units) for disconnected-component packing.
   *
   * @defaultValue 16.
   */
  readonly packNodeSize: number;
}

export const defaultFlatForceConfig: FlatForceConfig = {
  idealLinkLength: 40,
  jaccardWeight: 1,
  nodePadding: 3,
  convergenceThreshold: 0.01,
  stressMaxIterations: 200,
  overlapMinIterations: 40,
  overlapMaxIterations: 400,
  packNodeSize: 16,
};

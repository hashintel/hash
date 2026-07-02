/**
 * Tuning for the WebCola cluster (bubble/macro) layout
 * ({@link "./cluster-layout"}).
 *
 * Kept separate from the engine so the main thread (root `config.ts`, the dev
 * harness) can import the defaults without pulling WebCola into the page
 * bundle.
 */
export interface ClusterForceConfig {
  /** Non-overlap padding at the root level, as a fraction of the mean radius. @defaultValue 0.35. */
  readonly rootPaddingMultiplier: number;
  /** Non-overlap padding inside sub-clusters, as a fraction of the mean radius. @defaultValue 0.05. */
  readonly subPaddingMultiplier: number;
  /** Root-level ideal link length as a multiple of the pair's combined radii. @defaultValue 1.7. */
  readonly rootSeparationMultiplier: number;
  /** Sub-cluster ideal link length as a multiple of the pair's combined radii. @defaultValue 1.2. */
  readonly subSeparationMultiplier: number;
  /** Safety cap on majorisation steps so a layout always settles. @defaultValue 2000. */
  readonly maxSteps: number;
  /** WebCola alpha that kicks the descent into running after initialisation. @defaultValue 0.1. */
  readonly startAlpha: number;
  /** Overlap-relaxation passes when fitting a confined sub-cluster to its circle. @defaultValue 16. */
  readonly confinePasses: number;
  /** Child-to-port-anchor link length, as a fraction of the parent radius. @defaultValue 0.6. */
  readonly anchorLinkFraction: number;
}

export const defaultClusterForceConfig: ClusterForceConfig = {
  rootPaddingMultiplier: 0.35,
  subPaddingMultiplier: 0.05,
  rootSeparationMultiplier: 1.7,
  subSeparationMultiplier: 1.2,
  maxSteps: 2_000,
  startAlpha: 0.1,
  confinePasses: 16,
  anchorLinkFraction: 0.6,
};

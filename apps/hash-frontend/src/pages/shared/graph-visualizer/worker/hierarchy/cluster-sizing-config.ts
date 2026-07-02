/**
 * Sizing of cluster bubbles and entity dots: leaf radii from member counts
 * ({@link "./cluster-tree"}), enclosing-parent fits, and the entity-dot radius
 * used when a leaf opens ({@link "../core/hierarchical/hierarchical-layouts"},
 * {@link "../core/frames/structure-frame"}).
 *
 * Kept separate from {@link "./cluster-tree"} so the main thread (root
 * `config.ts`, the dev harness) can import the defaults without a cycle:
 * cluster-tree itself consumes the composed `VizConfig`.
 */
export interface ClusterSizingConfig {
  /**
   * Leaf radius = sqrt(count) × this.
   *
   * @defaultValue 5. Higher values enlarge all bubbles proportionally; lower
   * values increase overlap risk in force layout.
   */
  readonly radiusPerSqrtCount: number;
  /** Minimum leaf radius regardless of count, so tiny clusters stay clickable. @defaultValue 8. */
  readonly leafMinRadius: number;
  /** Larger floor so singleton-type top-level bubbles stay clickable. @defaultValue 15. */
  readonly topLevelMinRadius: number;
  /** Minimum gap enforced between sibling circles when sizing enclosing parents. @defaultValue 2. */
  readonly encloseGap: number;
  /** Extra margin on top of the enclosing fit so force layout can settle children without clipping. @defaultValue 3. */
  readonly enclosePadding: number;
  /**
   * Entity-dot radius as a fraction of the parent bubble radius.
   *
   * @defaultValue 0.02. Lower values keep dense leaves readable; higher values
   * make individual dots dominate the bubble.
   */
  readonly entityRadiusFraction: number;
}

export const defaultClusterSizingConfig: ClusterSizingConfig = {
  radiusPerSqrtCount: 5,
  leafMinRadius: 8,
  topLevelMinRadius: 15,
  encloseGap: 2,
  enclosePadding: 3,
  entityRadiusFraction: 0.02,
};

import type { ReactNode } from "react";

/** Top-level docs sections shown in the modal sidebar. */
export type DocSectionId =
  | "site-overview"
  | "product-overview"
  | "steps"
  | "opportunity-brief"
  | "settings";

/**
 * A navigable docs entry. Each entry renders a self-contained block of copy and
 * is addressable by `id` so the modal can deep-link / scroll to it (e.g. from a
 * step slideover or a cross-reference link).
 */
export interface DocEntry {
  /** Stable id, unique across all sections; doubles as the scroll-target DOM id. */
  id: string;
  /** Sidebar label. */
  title: string;
  /**
   * When true the entry is only shown if the Supplier Performance feature flag
   * is enabled (see `useSupplierPerformanceEnabled`).
   */
  supplierFlagGated?: boolean;
  render: () => ReactNode;
}

export interface DocSectionDef {
  id: DocSectionId;
  title: string;
  entries: DocEntry[];
}

/** A navigation target inside the modal: a section, optionally scrolled to an entry. */
export interface DocTarget {
  section: DocSectionId;
  /** Entry id (or any in-content anchor id) to scroll to. */
  sub?: string;
}

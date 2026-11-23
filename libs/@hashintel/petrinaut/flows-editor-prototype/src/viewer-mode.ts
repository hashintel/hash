/**
 * A viewer without edit rights (DES-252), behind `?viewer=readonly`: the editor opens like a past version, with
 * the read-only banner and no Restore, its inputs disabled and no Publish. Nobody has decided who gets this yet.
 */
export const viewerReadOnly =
  new URLSearchParams(globalThis.location.search).get("viewer") ===
  "readonly";

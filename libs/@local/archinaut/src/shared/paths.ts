/**
 * Path helpers shared by every stage that reports a file.
 *
 * Repo-relative, posix-separated paths are the model's currency: they appear in
 * `declaredIn`, in diagnostics, in edge examples and in source links. The
 * conversion lived in three modules separately, which is three chances for the
 * model to disagree with itself about what a path looks like on Windows.
 */

import { posix, sep } from "node:path";

/** Converts a platform path to the posix form the model always uses. */
export const toPosix = (path: string): string =>
  path.split(sep).join(posix.sep);

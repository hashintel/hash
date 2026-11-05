/**
 * TEMPORARY editor compatibility for Brunch's chat, until Petrinaut's plugin
 * API supplies what it reads here. Each export names the request that will
 * replace it; delete the export, and this file once empty, when that lands.
 * Nothing here changes what the editor allows: every edit still goes through
 * the plugin API, which checks again when it runs.
 *
 * - FE-2048 (API-04, under FE-2044): per-operation edit refusal before the
 *   chat offers or runs an edit.
 */

import { useLayoutEffect, useRef } from "react";

import { useReadOnlyReason } from "@hashintel/petrinaut/react";

import { editRefusalFor } from "./temporary-editor-compat/edit-refusal";

import type { ReadOnlyReason } from "@hashintel/petrinaut/react";
import type { PluginEdits } from "@hashintel/petrinaut/ui/plugin";

/** An edit the chat can ask about: one of the plugin API's document edits. */
export type TemporaryEditOperation = keyof PluginEdits;

/**
 * TEMPORARY (FE-2048): reads the refusal an edit would meet now, before the
 * chat offers consent or runs it, as the built-in chat's guard did. Reads the
 * editor's public `useReadOnlyReason`, so it must render inside the editor,
 * such as in an assistant plugin's content. The returned function reads the
 * latest state when called, including after an await; it never edits and
 * does not authorize one.
 */
export const useTemporaryEditRefusal = (): ((
  operation: TemporaryEditOperation,
) => ReadOnlyReason | null) => {
  const reason = useReadOnlyReason();
  const reasonRef = useRef(reason);
  useLayoutEffect(() => {
    reasonRef.current = reason;
  }, [reason]);

  return (operation) => editRefusalFor(operation, reasonRef.current);
};

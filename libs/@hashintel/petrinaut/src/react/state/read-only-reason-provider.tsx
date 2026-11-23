import { use } from "react";

import { SDCPNContext } from "../document/sdcpn-context";
import { SimulationContext } from "../simulation/context";
import { useEditorMode } from "./editor-context";
import {
  ReadOnlyReasonContext,
  readOnlyReasonOf,
} from "./use-read-only-reason";

/**
 * Works the read-only reason out once, for every reader of
 * `useReadOnlyReason` below. It reads the mode from the context that
 * `EditorProvider` changes with the mode, so the reason holds in the commit
 * that changes it. Its readers render only when the reason is a different
 * one.
 */
export const ReadOnlyReasonProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const { globalMode } = useEditorMode();
  const { readonly } = use(SDCPNContext);
  const { state: simulationState } = use(SimulationContext);
  // The same object for the same three values: the compiler memoizes it on
  // them, and the context renders its readers by identity.
  const reason = readOnlyReasonOf({ readonly, globalMode, simulationState });

  return (
    <ReadOnlyReasonContext value={reason}>{children}</ReadOnlyReasonContext>
  );
};

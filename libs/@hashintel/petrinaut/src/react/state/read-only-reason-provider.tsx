import { use } from "react";

import { SimulationContext } from "../simulation/context";
import { EditorContext } from "./editor-context";
import { SDCPNContext } from "./sdcpn-context";
import {
  ReadOnlyReasonContext,
  readOnlyReasonOf,
} from "./use-read-only-reason";

/**
 * Works the read-only reason out once, for every reader of
 * `useReadOnlyReason` below. This component renders with each change of the
 * three contexts it reads. Its readers render only when the reason is a
 * different one.
 */
export const ReadOnlyReasonProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const { readonly } = use(SDCPNContext);
  const { globalMode } = use(EditorContext);
  const { state: simulationState } = use(SimulationContext);
  // The same object for the same three values: the compiler memoizes it on
  // them, and the context renders its readers by identity.
  const reason = readOnlyReasonOf({ readonly, globalMode, simulationState });

  return (
    <ReadOnlyReasonContext value={reason}>{children}</ReadOnlyReasonContext>
  );
};

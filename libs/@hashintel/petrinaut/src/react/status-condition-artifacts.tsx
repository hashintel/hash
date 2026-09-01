import {
  createContext,
  use,
  useEffect,
  useState,
  type FC,
  type PropsWithChildren,
} from "react";

import { LanguageClientContext } from "./lsp/context";
import { SDCPNContext } from "./state/sdcpn-context";

import type { HirStatusConditionArtifact } from "@hashintel/petrinaut-core";

export type StatusConditionArtifactsValue = {
  /** Compiled label conditions, keyed by `getStatusConditionArtifactKey`. */
  statusConditions: Record<string, HirStatusConditionArtifact>;
  /**
   * True while declared conditions await compilation. Labels with a
   * condition match nothing until their artifact arrives (the evaluator
   * fails closed), so consumers can tell a settled result from a pending
   * one.
   */
  pending: boolean;
  /** Compile or transport failure summary; null when everything compiled. */
  error: string | null;
};

const noArtifacts: StatusConditionArtifactsValue = {
  statusConditions: {},
  pending: false,
  error: null,
};

/**
 * The net's compiled status-label token conditions, recompiled through the
 * LSP worker whenever the document changes — shared here so the canvas
 * badges, the Kanban board, and the events panel issue one compile request
 * per change rather than one each. Empty (and never pending) when no label
 * declares a condition.
 */
export const StatusConditionArtifactsContext =
  createContext<StatusConditionArtifactsValue>(noArtifacts);

export const StatusConditionArtifactsProvider: FC<PropsWithChildren> = ({
  children,
}) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const { requestHirArtifacts } = use(LanguageClientContext);

  const hasConditions = (petriNetDefinition.statusViews ?? []).some(
    (statusView) =>
      statusView.labels.some(
        (label) => (label.tokenCondition ?? "").trim() !== "",
      ),
  );

  const [compiled, setCompiled] = useState<{
    forDefinition: unknown;
    result: StatusConditionArtifactsValue;
  } | null>(null);

  useEffect(() => {
    if (!hasConditions) {
      return;
    }
    let cancelled = false;
    requestHirArtifacts(petriNetDefinition)
      .then(({ artifacts, failures }) => {
        if (cancelled) {
          return;
        }
        const conditionFailures = failures.filter(
          (failure) => failure.itemType === "status-label-condition",
        );
        const firstMessage = conditionFailures[0]?.diagnostics[0]?.message;
        setCompiled({
          forDefinition: petriNetDefinition,
          result: {
            statusConditions: artifacts.statusConditions,
            pending: false,
            error:
              conditionFailures.length === 0
                ? null
                : `${conditionFailures.length} status label condition(s) failed to compile${
                    firstMessage ? `: ${firstMessage}` : "."
                  }`,
          },
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setCompiled({
          forDefinition: petriNetDefinition,
          result: {
            statusConditions: {},
            pending: false,
            error: `Status label conditions could not be compiled: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        });
      });
    return () => {
      cancelled = true;
    };
  }, [hasConditions, petriNetDefinition, requestHirArtifacts]);

  // While a recompile for the current definition is in flight, the previous
  // artifacts stay available and `pending` marks them provisional.
  const value = !hasConditions
    ? noArtifacts
    : compiled && compiled.forDefinition === petriNetDefinition
      ? compiled.result
      : {
          statusConditions: compiled?.result.statusConditions ?? {},
          pending: true,
          error: compiled?.result.error ?? null,
        };

  return (
    <StatusConditionArtifactsContext value={value}>
      {children}
    </StatusConditionArtifactsContext>
  );
};

import { use, useEffect, useState } from "react";

import {
  getStatusViewEvaluationScope,
  type HirStatusConditionArtifact,
  type InstanceStatus,
  type SDCPN,
  type StatusView,
} from "@hashintel/petrinaut-core";

import { ExecutionFrameSourceContext } from "../../../../react/execution-frame/context";
import { LanguageClientContext } from "../../../../react/lsp/context";
import { SDCPNContext } from "../../../../react/state/sdcpn-context";
import { createBoardReplay } from "../kanban-view/board-replay";

const COMPILE_DEBOUNCE_MS = 300;

export type DraftConditionArtifacts = {
  statusConditions: Record<string, HirStatusConditionArtifact>;
  /** First compile message per label id, for labels that failed. */
  failures: Record<string, string>;
  pending: boolean;
  error: string | null;
};

const NO_ARTIFACTS: DraftConditionArtifacts = {
  statusConditions: {},
  failures: {},
  pending: false,
  error: null,
};

const hasConditions = (statusViews: readonly StatusView[]) =>
  statusViews.some((view) =>
    view.labels.some((label) => (label.tokenCondition ?? "").trim() !== ""),
  );

/**
 * Compiles the status conditions of the saved net with `statusViews` in
 * place of its own, debounced. Keeps the last compiled artifacts while a
 * newer draft is pending.
 */
export const useDraftConditionArtifacts = (
  statusViews: readonly StatusView[],
): DraftConditionArtifacts => {
  const { petriNetDefinition } = use(SDCPNContext);
  const { requestHirArtifacts } = use(LanguageClientContext);
  const draftKey = JSON.stringify(statusViews);
  const [compiled, setCompiled] = useState<{
    key: string;
    result: DraftConditionArtifacts;
  } | null>(null);

  useEffect(() => {
    const draftViews = JSON.parse(draftKey) as StatusView[];
    if (!hasConditions(draftViews)) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      const definition: SDCPN = {
        ...petriNetDefinition,
        statusViews: draftViews,
      };
      requestHirArtifacts(definition)
        .then(({ artifacts, failures }) => {
          if (cancelled) {
            return;
          }
          const labelFailures: Record<string, string> = {};
          for (const failure of failures) {
            if (failure.itemType === "status-label-condition") {
              labelFailures[failure.itemId] =
                failure.diagnostics[0]?.message ?? "Does not compile.";
            }
          }
          setCompiled({
            key: draftKey,
            result: {
              statusConditions: artifacts.statusConditions,
              failures: labelFailures,
              pending: false,
              error: null,
            },
          });
        })
        .catch((error: unknown) => {
          if (cancelled) {
            return;
          }
          setCompiled({
            key: draftKey,
            result: {
              statusConditions: {},
              failures: {},
              pending: false,
              error: error instanceof Error ? error.message : String(error),
            },
          });
        });
    }, COMPILE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draftKey, petriNetDefinition, requestHirArtifacts]);

  if (!hasConditions(statusViews)) {
    return NO_ARTIFACTS;
  }
  if (compiled?.key === draftKey) {
    return compiled.result;
  }
  return {
    statusConditions: compiled?.result.statusConditions ?? {},
    failures: compiled?.result.failures ?? {},
    pending: true,
    error: compiled?.result.error ?? null,
  };
};

/**
 * Replays the current frame source through each view, so cards follow the
 * draft. Keyed by view id. Null when there is no run or stream to replay.
 */
export const useDraftReplays = (
  views: readonly StatusView[],
  statusConditions: Record<string, HirStatusConditionArtifact>,
): Record<string, InstanceStatus[]> | null => {
  const { petriNetDefinition } = use(SDCPNContext);
  const { currentFrameIndex, currentFrameReader, getFramesInRange } = use(
    ExecutionFrameSourceContext,
  );
  const viewsKey = JSON.stringify(views);
  const [boards, setBoards] = useState<Record<string, InstanceStatus[]> | null>(
    null,
  );

  useEffect(() => {
    if (!currentFrameReader) {
      return;
    }
    let cancelled = false;
    const { places, types } = getStatusViewEvaluationScope(petriNetDefinition);
    const parsed = JSON.parse(viewsKey) as StatusView[];
    Promise.all(
      parsed.map((statusView) =>
        createBoardReplay({ statusView, places, types, statusConditions })
          .advanceTo(currentFrameIndex, getFramesInRange)
          .then((snapshot) => [statusView.id, snapshot.instances] as const),
      ),
    )
      .then((entries) => {
        if (!cancelled) {
          setBoards(Object.fromEntries(entries));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBoards(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    viewsKey,
    currentFrameIndex,
    currentFrameReader,
    getFramesInRange,
    petriNetDefinition,
    statusConditions,
  ]);

  return currentFrameReader ? boards : null;
};

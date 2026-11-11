import { Banner, Button, LoadingSpinner } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { useAuthenticatedUser } from "../../../../../shared/auth-info-context";
import { toRunRow } from "./logs-view/run-list";
import { RunsTable } from "./logs-view/runs-table";
import { useFlowRuns } from "./shared/use-flow-runs";

import type { EntityId, WebId } from "@blockprotocol/type-system";

const page = css({ flex: "1", minHeight: "0", overflowY: "auto", p: "6" });
const heading = css({
  display: "flex",
  alignItems: "baseline",
  gap: "2",
  mb: "3",
});
const title = css({
  textStyle: "lg",
  fontWeight: "semibold",
  color: "fg.heading",
});
const runCount = css({ textStyle: "xs", color: "fg.subtle" });
const centered = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "1",
  height: "full",
  textAlign: "center",
});
const emptyTitle = css({ fontWeight: "medium", color: "fg.heading" });
const emptyText = css({ textStyle: "sm", color: "fg.muted" });
const failure = css({ maxWidth: "[560px]", mx: "auto" });

/** The editor's Logs view: the flow's runs. */
export const LogsView = ({
  flowDefinitionEntityId,
  getRunPath,
}: {
  flowDefinitionEntityId: EntityId;
  /** Where a run opens. */
  getRunPath: (flowRunEntityId: EntityId) => string;
}) => {
  const { flowRuns, retry } = useFlowRuns(flowDefinitionEntityId);
  const { authenticatedUser } = useAuthenticatedUser();

  if (flowRuns.status === "loading") {
    return (
      <div className={page}>
        <div className={centered}>
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  if (flowRuns.status === "failed") {
    return (
      <div className={page}>
        <div className={failure}>
          <Banner tone="error">
            <Banner.Title>Couldn't load this flow's runs</Banner.Title>
            <Banner.Description>{flowRuns.message}</Banner.Description>
            <Button size="sm" variant="subtle" onClick={retry}>
              Try again
            </Button>
          </Banner>
        </div>
      </div>
    );
  }

  if (flowRuns.runs.length === 0) {
    return (
      <div className={page}>
        <div className={centered}>
          <span className={emptyTitle}>No runs yet</span>
          <span className={emptyText}>
            Runs of this flow show here, whether started with Run or by a
            schedule.
          </span>
        </div>
      </div>
    );
  }

  /* The runs the user can read are in their own web or their orgs'. */
  const webShortnames = new Map<WebId, string | undefined>([
    [authenticatedUser.accountId, authenticatedUser.shortname],
    ...authenticatedUser.memberOf.map(
      ({ org }) => [org.webId, org.shortname] as const,
    ),
  ]);

  return (
    <div className={page}>
      <div className={heading}>
        <span className={title}>Runs</span>
        <span className={runCount}>
          {flowRuns.runs.length === 1
            ? "1 run"
            : `${flowRuns.runs.length} runs`}
        </span>
      </div>
      <RunsTable
        rows={flowRuns.runs.map((run) =>
          toRunRow(run, webShortnames.get(run.webId) ?? null),
        )}
        now={flowRuns.loadedAt}
        getRunPath={getRunPath}
      />
    </div>
  );
};

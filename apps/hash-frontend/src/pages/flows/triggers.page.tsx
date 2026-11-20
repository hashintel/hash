import { useRouter } from "next/router";
import { useMemo, useState } from "react";

import {
  Button,
  LoadingSpinner,
  SegmentedControl,
  Select,
  TextInput,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { flowTriggersFlowFilterParam } from "@local/hash-isomorphic-utils/flows/frontend-paths";

import { useGetOwnerForEntity } from "../../components/hooks/use-get-owner-for-entity";
import { getLayoutWithSidebar } from "../../shared/layout";
import { FlowsEmptyState } from "../flows.page/flows-empty-state";
import { useAuthenticatedUser } from "../shared/auth-info-context";
import { DsComponentsScope } from "../shared/ds-components-scope";
import { useFlowSchedules } from "../shared/use-flow-schedules";
import {
  filterFlowTriggerRows,
  sortFlowTriggerRows,
  toFlowTriggerRow,
} from "./triggers.page/flow-trigger-rows";
import { TriggersTable } from "./triggers.page/triggers-table";

import type { NextPageWithLayout } from "../../shared/layout";
import type { TriggerState } from "../@/[shortname]/flows/[flow-def-id]/edit.page/shared/flow-triggers";
import type {
  FlowTriggerRow,
  FlowTriggerSort,
} from "./triggers.page/flow-trigger-rows";
import type { EntityId, WebId } from "@blockprotocol/type-system";

/** The Flow and Web filters' option for not filtering. */
const all = "all";

const content = css({
  display: "flex",
  flexDirection: "column",
  gap: "8",
  p: "12",
});
const titles = css({ display: "flex", flexDirection: "column", gap: "0.5" });
const title = css({
  /* The design system's page title, between its 2xl and 3xl text styles. */
  fontSize: "[28px]",
  lineHeight: "[32px]",
  fontWeight: "semibold",
  color: "fg.heading",
});
const subtitle = css({ textStyle: "sm", color: "fg.body" });
const body = css({ display: "flex", flexDirection: "column", gap: "4" });
const filters = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "2",
});
const searchInput = css({ width: "[240px]" });
const flowSelect = css({ width: "[200px]" });
const webSelect = css({ width: "[148px]" });
const loading = css({ display: "flex", justifyContent: "center", py: "24" });

/** The distinct values among the rows, sorted by their text, for a filter's options. */
const toOptions = <Value extends string>(
  entries: { value: Value | null; text: string }[],
) =>
  [
    ...new Map(
      entries.flatMap(({ value, text }) =>
        value === null ? [] : [[value, { value, text }] as const],
      ),
    ).values(),
  ].sort((left, right) => left.text.localeCompare(right.text));

const TriggersPage: NextPageWithLayout = () => {
  const router = useRouter();
  const { authenticatedUser } = useAuthenticatedUser();
  const getOwner = useGetOwnerForEntity();

  const {
    schedulesByEntityUuid,
    flowsByScheduleEntityUuid,
    loaded,
    error,
    refetch,
  } = useFlowSchedules({ includeFlows: true });

  const [search, setSearch] = useState("");
  const [state, setState] = useState<TriggerState>("all");
  const [webId, setWebId] = useState<WebId | null>(null);
  const [sort, setSort] = useState<FlowTriggerSort>({
    column: "flow",
    direction: "asc",
  });

  /* In the URL, so the editor can link to one flow's triggers. */
  const flowParam = router.query[flowTriggersFlowFilterParam];
  const flowEntityId =
    typeof flowParam === "string" && flowParam !== ""
      ? (flowParam as EntityId)
      : null;
  const setFlowEntityId = (nextFlowEntityId: EntityId | null) => {
    const { [flowTriggersFlowFilterParam]: _, ...query } = router.query;

    void router.replace(
      {
        pathname: router.pathname,
        query: nextFlowEntityId
          ? { ...query, [flowTriggersFlowFilterParam]: nextFlowEntityId }
          : query,
      },
      undefined,
      { shallow: true },
    );
  };

  const rows = useMemo<FlowTriggerRow[]>(
    () =>
      Array.from(schedulesByEntityUuid, ([scheduleEntityUuid, schedule]) => {
        const { shortname } = getOwner({
          entityId: schedule.metadata.recordId.entityId,
        });

        return toFlowTriggerRow({
          schedule,
          flow: flowsByScheduleEntityUuid.get(scheduleEntityUuid),
          webName: shortname === "" ? "" : `@${shortname}`,
        });
      }),
    [schedulesByEntityUuid, flowsByScheduleEntityUuid, getOwner],
  );

  /* Someone in only one web has all their triggers there, unless another web's are public. */
  const showWeb =
    authenticatedUser.memberOf.length > 0 ||
    rows.some((row) => row.webId !== authenticatedUser.accountId);

  const flowOptions = useMemo(() => {
    const options = toOptions(
      /* Flows the user can't read can't be told apart, so they're not offered. */
      rows.map((row) => ({
        value: row.flowName === null ? null : row.flowEntityId,
        text: row.flowName ?? "",
      })),
    );

    /* The editor links here for a flow with no triggers too, whose name isn't known without one. */
    return flowEntityId === null ||
      options.some(({ value }) => value === flowEntityId)
      ? options
      : [...options, { value: flowEntityId, text: "Selected flow" }];
  }, [rows, flowEntityId]);

  const webOptions = useMemo(
    () =>
      toOptions(rows.map((row) => ({ value: row.webId, text: row.webName }))),
    [rows],
  );

  const shown = useMemo(
    () =>
      sortFlowTriggerRows(
        filterFlowTriggerRows(rows, {
          state,
          search,
          flowEntityId,
          webId: showWeb ? webId : null,
        }),
        sort,
      ),
    [rows, state, search, flowEntityId, webId, showWeb, sort],
  );

  const flowWithoutTriggers =
    flowEntityId !== null &&
    !rows.some((row) => row.flowEntityId === flowEntityId);

  return (
    <DsComponentsScope>
      <main className={content}>
        <div className={titles}>
          <h1 className={title}>Triggers</h1>
          <p className={subtitle}>What can start each flow</p>
        </div>
        {!loaded ? (
          error ? (
            <FlowsEmptyState
              title="Couldn't load the triggers"
              description="Something went wrong reading them."
            >
              <Button
                size="sm"
                variant="subtle"
                tone="neutral"
                onClick={() => {
                  void refetch();
                }}
              >
                Try again
              </Button>
            </FlowsEmptyState>
          ) : (
            <div className={loading}>
              <LoadingSpinner size="lg" />
            </div>
          )
        ) : rows.length === 0 && flowEntityId === null ? (
          <FlowsEmptyState
            title="No triggers yet"
            description="Schedules that start your flows are listed here."
          />
        ) : (
          <div className={body}>
            <div className={filters}>
              <div className={searchInput}>
                <TextInput
                  size="sm"
                  value={search}
                  onChange={setSearch}
                  placeholder="Search triggers"
                  aria-label="Search triggers"
                  prefix={{ iconName: "search", variant: "subtle" }}
                  clearable
                />
              </div>
              <div className={flowSelect}>
                <Select<string>
                  size="sm"
                  aria-label="Flow"
                  searchable
                  required
                  items={[{ value: all, text: "All flows" }, ...flowOptions]}
                  value={flowEntityId ?? all}
                  onChange={(value) =>
                    setFlowEntityId(value === all ? null : (value as EntityId))
                  }
                />
              </div>
              {showWeb && (
                <div className={webSelect}>
                  <Select<string>
                    size="sm"
                    aria-label="Web"
                    required
                    items={[{ value: all, text: "All webs" }, ...webOptions]}
                    value={webId ?? all}
                    onChange={(value) =>
                      setWebId(value === all ? null : (value as WebId))
                    }
                  />
                </div>
              )}
              <SegmentedControl<TriggerState>
                size="sm"
                aria-label="Show triggers"
                items={[
                  { value: "all", label: "All" },
                  { value: "on", label: "On" },
                  { value: "paused", label: "Paused" },
                ]}
                value={state}
                onChange={setState}
              />
            </div>
            {shown.length === 0 ? (
              <FlowsEmptyState
                title={
                  flowWithoutTriggers ? "No triggers yet" : "No triggers match"
                }
                description={
                  flowWithoutTriggers
                    ? "This flow has no triggers you can see."
                    : "None of the triggers you can see match these filters."
                }
              />
            ) : (
              <TriggersTable
                rows={shown}
                showWeb={showWeb}
                sort={sort}
                onSortChange={setSort}
              />
            )}
          </div>
        )}
      </main>
    </DsComponentsScope>
  );
};

TriggersPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
    grayBackground: false,
  });

export default TriggersPage;

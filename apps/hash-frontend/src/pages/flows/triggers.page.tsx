import { useMutation } from "@apollo/client";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";

import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import {
  Banner,
  Button,
  LoadingSpinner,
  SortMenu,
  Tabs,
  TextInput,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  flowTriggersAddParam,
  flowTriggersFlowFilterParam,
} from "@local/hash-isomorphic-utils/flows/frontend-paths";

import { useGetOwnerForEntity } from "../../components/hooks/use-get-owner-for-entity";
import {
  archiveFlowScheduleMutation,
  pauseFlowScheduleMutation,
  resumeFlowScheduleMutation,
} from "../../graphql/queries/knowledge/flow.queries";
import { getLayoutWithSidebar } from "../../shared/layout";
import { FlowsEmptyState } from "../flows.page/flows-empty-state";
import { useAuthenticatedUser } from "../shared/auth-info-context";
import { DsComponentsScope } from "../shared/ds-components-scope";
import { useFlowSchedules } from "../shared/use-flow-schedules";
import { DeleteTriggerDialog } from "./triggers.page/delete-trigger-dialog";
import {
  filterFlowTriggerRows,
  sortFlowTriggerRows,
  toFlowTriggerRow,
} from "./triggers.page/flow-trigger-rows";
import {
  AddTriggerFilter,
  TriggerFilterBar,
} from "./triggers.page/trigger-filters";
import { EditTriggerForm, NewTriggerForm } from "./triggers.page/trigger-forms";
import { TriggersTable } from "./triggers.page/triggers-table";

import type {
  ArchiveFlowScheduleMutation,
  ArchiveFlowScheduleMutationVariables,
  PauseFlowScheduleMutation,
  PauseFlowScheduleMutationVariables,
  ResumeFlowScheduleMutation,
  ResumeFlowScheduleMutationVariables,
} from "../../graphql/api-types.gen";
import type { NextPageWithLayout } from "../../shared/layout";
import type { TriggerState } from "../@/[shortname]/flows/[flow-def-id]/edit.page/shared/flow-triggers";
import type {
  FlowTriggerRow,
  FlowTriggerSort,
} from "./triggers.page/flow-trigger-rows";
import type { TriggerFilterProperty } from "./triggers.page/trigger-filters";
import type { TriggerColumn } from "./triggers.page/triggers-table";
import type { EntityId, WebId } from "@blockprotocol/type-system";
import type { ScheduleSpec } from "@local/hash-isomorphic-utils/flows/schedule-types";

const tabs: { id: TriggerState; label: string }[] = [
  { id: "all", label: "All" },
  { id: "on", label: "On" },
  { id: "paused", label: "Paused" },
];

/** The table's columns, in order, each also a choice in Sort. */
const triggerColumns: TriggerColumn[] = [
  { name: "Flow", sortKey: "flow", className: css({ width: "[24%]" }) },
  { name: "Trigger", sortKey: "trigger" },
  { name: "Web", sortKey: "web", className: css({ width: "[12%]" }) },
  {
    name: "Status",
    sortKey: "status",
    sortIcon: "generic",
    className: css({ width: "[18%]" }),
  },
];

const content = css({
  display: "flex",
  flexDirection: "column",
  gap: "8",
  p: "12",
});
const titles = css({ display: "flex", flexDirection: "column", gap: "0.5" });
const title = css({
  /* The design's page title, between the 2xl and 3xl text styles. */
  fontSize: "[28px]",
  lineHeight: "[32px]",
  fontWeight: "semibold",
  color: "fg.heading",
});
const subtitle = css({ textStyle: "sm", color: "fg.body" });
const body = css({ display: "flex", flexDirection: "column", gap: "4" });
const tabCount = css({ color: "fg.subtle", ml: "1.5" });
const searchInput = css({ width: "[200px]", pl: "2" });
const loading = css({ display: "flex", justifyContent: "center", py: "24" });

/** The distinct values among the rows, sorted by their text, for a filter's options. */
const toOptions = (entries: { value: string | null; text: string }[]) =>
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
  const [tab, setTab] = useState<TriggerState>("all");
  const [webId, setWebId] = useState<WebId | null>(null);
  const [sort, setSort] = useState<FlowTriggerSort>({
    key: "flow",
    direction: "ASCENDING",
  });
  const [shownFilters, setShownFilters] = useState<TriggerFilterProperty[]>([]);
  const [addedFilter, setAddedFilter] = useState<TriggerFilterProperty | null>(
    null,
  );

  /** Sets or removes query parameters, keeping the others. */
  const replaceQuery = (changes: Record<string, string | null>) => {
    const query = { ...router.query };

    for (const [param, value] of Object.entries(changes)) {
      if (value === null) {
        delete query[param];
      } else {
        query[param] = value;
      }
    }

    void router.replace({ pathname: router.pathname, query }, undefined, {
      shallow: true,
    });
  };

  /* In the URL, so the editor can link to one flow's triggers. */
  const flowParam = router.query[flowTriggersFlowFilterParam];
  const flowEntityId =
    typeof flowParam === "string" && flowParam !== ""
      ? (flowParam as EntityId)
      : null;
  const setFlowEntityId = (nextFlowEntityId: EntityId | null) =>
    replaceQuery({ [flowTriggersFlowFilterParam]: nextFlowEntityId });

  /*
   * Whether the form for adding a trigger is open: in the URL too, so the editor's "Add trigger" can open it. Only one
   * form is open at a time, so opening it closes the trigger being edited.
   */
  const adding = flowTriggersAddParam in router.query;
  const [editingEntityId, setEditingEntityId] = useState<EntityId | null>(null);
  const setAdding = (open: boolean) => {
    setEditingEntityId(null);
    replaceQuery({ [flowTriggersAddParam]: open ? "" : null });
  };
  const edit = (entityId: EntityId) => {
    if (adding) {
      replaceQuery({ [flowTriggersAddParam]: null });
    }

    setEditingEntityId(entityId);
  };

  const [deletingRow, setDeletingRow] = useState<FlowTriggerRow | null>(null);
  /* Why pausing or resuming a trigger failed, e.g. the API refusing to resume one whose flow has changed. */
  const [actionError, setActionError] = useState<{
    title: string;
    message: string;
  } | null>(null);

  const [pauseFlowSchedule] = useMutation<
    PauseFlowScheduleMutation,
    PauseFlowScheduleMutationVariables
  >(pauseFlowScheduleMutation);
  const [resumeFlowSchedule] = useMutation<
    ResumeFlowScheduleMutation,
    ResumeFlowScheduleMutationVariables
  >(resumeFlowScheduleMutation);
  const [archiveFlowSchedule] = useMutation<
    ArchiveFlowScheduleMutation,
    ArchiveFlowScheduleMutationVariables
  >(archiveFlowScheduleMutation);

  /*
   * Fetches the triggers after a change. One that fails leaves the rows as they were until the next poll, rather than
   * making the change look like it failed, which would invite making it again.
   */
  const refresh = () => refetch().catch(() => undefined);

  /* The trigger being paused or resumed, whose switch and menu wait for it. */
  const [switchingEntityId, setSwitchingEntityId] = useState<EntityId | null>(
    null,
  );

  const setOn = async (row: FlowTriggerRow, on: boolean) => {
    setActionError(null);
    setSwitchingEntityId(row.entityId);

    try {
      const variables = { scheduleEntityId: row.entityId };

      await (on
        ? resumeFlowSchedule({ variables })
        : pauseFlowSchedule({ variables }));
    } catch (caught) {
      setActionError({
        title: `“${row.text}” wasn't ${on ? "resumed" : "paused"}`,
        message: caught instanceof Error ? caught.message : String(caught),
      });
      setSwitchingEntityId(null);
      return;
    }

    await refresh();
    setSwitchingEntityId(null);
  };

  /* Archiving a schedule deletes its Temporal schedule; its runs stay readable. */
  const deleteTrigger = async (row: FlowTriggerRow) => {
    await archiveFlowSchedule({
      variables: { scheduleEntityId: row.entityId },
    });
    await refresh();

    if (editingEntityId === row.entityId) {
      setEditingEntityId(null);
    }

    setDeletingRow(null);
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
  const columns = showWeb
    ? triggerColumns
    : triggerColumns.filter(({ sortKey }) => sortKey !== "web");
  const filterProperties: TriggerFilterProperty[] = showWeb
    ? ["flow", "web"]
    : ["flow"];
  /* A flow linked to from the editor shows its filter. */
  const filtersShown = filterProperties.filter(
    (property) =>
      shownFilters.includes(property) ||
      (property === "flow" && flowEntityId !== null),
  );
  const values = { flow: flowEntityId, web: showWeb ? webId : null };

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

  const filtered = useMemo(
    () =>
      filterFlowTriggerRows(rows, {
        search,
        flowEntityId: values.flow,
        webId: values.web,
      }),
    [rows, search, values.flow, values.web],
  );
  const counts: Record<TriggerState, number> = {
    all: filtered.length,
    on: filtered.filter((row) => row.on).length,
    paused: filtered.filter((row) => !row.on).length,
  };
  const shown = useMemo(
    () =>
      sortFlowTriggerRows(
        filtered.filter((row) => tab === "all" || (tab === "on") === row.on),
        sort,
      ),
    [filtered, tab, sort],
  );

  const flowWithoutTriggers =
    flowEntityId !== null &&
    !rows.some((row) => row.flowEntityId === flowEntityId);

  const editingRow = shown.find((row) => row.entityId === editingEntityId);
  const editingSchedule = editingRow
    ? schedulesByEntityUuid.get(
        extractEntityUuidFromEntityId(editingRow.entityId),
      )
    : undefined;

  const addTrigger = (
    <Button
      size="sm"
      variant="subtle"
      tone="neutral"
      iconName="plus"
      pressed={adding}
      onClick={() => setAdding(true)}
    >
      Add trigger
    </Button>
  );

  const changeFilter = (
    property: TriggerFilterProperty,
    value: string | null,
  ) =>
    property === "flow"
      ? setFlowEntityId(value as EntityId | null)
      : setWebId(value as WebId | null);

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
        ) : rows.length === 0 && flowEntityId === null && !adding ? (
          <FlowsEmptyState
            title="No triggers yet"
            description="Schedules that start your flows are listed here."
          >
            {addTrigger}
          </FlowsEmptyState>
        ) : (
          <div className={body}>
            <Tabs value={tab} onChange={setTab} variant="pill" size="sm">
              <Tabs.TabList
                items={tabs.map(({ id, label }) => ({
                  id,
                  children: (
                    <>
                      {label}
                      <span className={tabCount}>{counts[id]}</span>
                    </>
                  ),
                }))}
                actions={
                  <>
                    <SortMenu
                      items={columns}
                      value={{ sortKey: sort.key, direction: sort.direction }}
                      onChange={(key, direction) => setSort({ key, direction })}
                      position="bottom-end"
                      /* Labelled "Sort" as in the design; the headers show the sorted column. */
                      renderTrigger={(sorter, direction) => (
                        <Button
                          size="sm"
                          variant="ghost"
                          tone="neutral"
                          iconName="sortDown"
                          aria-label={
                            sorter && direction
                              ? `Sort by ${sorter.name}, ${direction.toLowerCase()}`
                              : "Sort"
                          }
                        >
                          Sort
                        </Button>
                      )}
                    />
                    <AddTriggerFilter
                      properties={filterProperties}
                      shown={filtersShown}
                      appliedCount={
                        filterProperties.filter(
                          (property) => values[property] !== null,
                        ).length
                      }
                      onAdd={(property) => {
                        setShownFilters((current) => [...current, property]);
                        setAddedFilter(property);
                      }}
                    />
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
                    {addTrigger}
                  </>
                }
              />
            </Tabs>
            {filtersShown.length > 0 && (
              <TriggerFilterBar
                shown={filtersShown}
                added={addedFilter}
                options={{ flow: flowOptions, web: webOptions }}
                values={values}
                onChange={changeFilter}
                onRemove={(property) => {
                  setShownFilters((current) =>
                    current.filter((each) => each !== property),
                  );
                  changeFilter(property, null);
                }}
                onClear={() => {
                  setShownFilters([]);
                  setFlowEntityId(null);
                  setWebId(null);
                }}
              />
            )}
            {actionError !== null && (
              <Banner
                tone="error"
                dismissible={{ onDismiss: () => setActionError(null) }}
              >
                <Banner.Title>{actionError.title}</Banner.Title>
                <Banner.Description as="div">
                  {actionError.message.split("\n").map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </Banner.Description>
              </Banner>
            )}
            {shown.length === 0 && !adding ? (
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
                columns={columns}
                sort={sort}
                onSort={setSort}
                newTriggerForm={
                  adding ? (
                    <NewTriggerForm
                      initialFlowEntityId={flowEntityId}
                      onAdded={async () => {
                        await refresh();
                        setAdding(false);
                      }}
                      onCancel={() => setAdding(false)}
                    />
                  ) : null
                }
                editing={
                  editingRow && editingSchedule
                    ? {
                        entityId: editingRow.entityId,
                        form: (
                          <EditTriggerForm
                            key={editingRow.entityId}
                            scheduleEntityId={editingRow.entityId}
                            scheduleSpec={
                              editingSchedule.properties
                                .scheduleSpec as ScheduleSpec
                            }
                            webName={editingRow.webName}
                            onSaved={async () => {
                              await refresh();
                              setEditingEntityId(null);
                            }}
                            onCancel={() => setEditingEntityId(null)}
                          />
                        ),
                      }
                    : null
                }
                onEdit={(row) => edit(row.entityId)}
                onCloseEdit={() => setEditingEntityId(null)}
                switchingEntityId={switchingEntityId}
                onSetOn={(row, on) => {
                  void setOn(row, on);
                }}
                onDelete={setDeletingRow}
              />
            )}
          </div>
        )}
        {deletingRow && (
          <DeleteTriggerDialog
            text={deletingRow.text}
            onDelete={() => deleteTrigger(deletingRow)}
            onClose={() => setDeletingRow(null)}
          />
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

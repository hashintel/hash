import { useMemo, useState } from "react";

import { LoadingSpinner, TextInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { isGoalFlowDefinitionEntityId } from "@local/hash-isomorphic-utils/flows/flow-definition-ids";
import {
  generateFlowDefinitionPath,
  generateFlowEditorPath,
} from "@local/hash-isomorphic-utils/flows/frontend-paths";

import { useGetOwnerForEntity } from "../components/hooks/use-get-owner-for-entity";
import { getLayoutWithSidebar } from "../shared/layout";
import { FlowsEmptyState } from "./flows.page/flows-empty-state";
import { FlowsTable } from "./flows.page/flows-table";
import { NewFlowButton } from "./flows.page/new-flow-button";
import { useCreateFlow } from "./flows.page/use-create-flow";
import { DsComponentsScope } from "./shared/ds-components-scope";
import { useFlowDefinitionsContext } from "./shared/flow-definitions-context";
import { FlowDefinitionsContextProvider } from "./shared/flow-definitions-context-provider";

import type { NextPageWithLayout } from "../shared/layout";
import type { FlowRow } from "./flows.page/flows-table";

const content = css({
  display: "flex",
  flexDirection: "column",
  gap: "8",
  p: "12",
});
const header = css({
  display: "flex",
  alignItems: "flex-start",
  gap: "4",
});
const titles = css({
  display: "flex",
  flexDirection: "column",
  gap: "0.5",
  flex: "1",
});
const title = css({
  /* The design system's page title, between its 2xl and 3xl text styles. */
  fontSize: "[28px]",
  lineHeight: "[32px]",
  fontWeight: "semibold",
  color: "fg.heading",
});
const subtitle = css({ textStyle: "sm", color: "fg.muted" });
const actions = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  mt: "1",
});
const search = css({ width: "[240px]" });
const loading = css({ display: "flex", justifyContent: "center", py: "24" });

const FlowsPageContent = () => {
  const [searchText, setSearchText] = useState("");

  const { flowDefinitions, loading: flowsLoading } =
    useFlowDefinitionsContext();

  const getOwner = useGetOwnerForEntity();

  const createFlow = useCreateFlow();

  const flows = useMemo<FlowRow[]>(
    () =>
      flowDefinitions
        .filter(
          ({ flowDefinitionEntityId }) =>
            !isGoalFlowDefinitionEntityId(flowDefinitionEntityId),
        )
        .map(
          ({ flowDefinitionEntityId, name, userCanUpdate, lastEditedAt }) => {
            const { shortname } = getOwner({
              entityId: flowDefinitionEntityId,
            });
            const pathParams = { shortname, flowDefinitionEntityId };

            return {
              flowDefinitionEntityId,
              name,
              /* The editor can't open a flow the user can't edit, so that opens on its own page, as it did before. */
              path: userCanUpdate
                ? generateFlowEditorPath(pathParams)
                : generateFlowDefinitionPath(pathParams),
              lastEditedAt,
            };
          },
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [flowDefinitions, getOwner],
  );

  const matchingFlows = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return flows.filter(({ name }) => name.toLowerCase().includes(query));
  }, [flows, searchText]);

  const noFlows = !flowsLoading && flows.length === 0;

  return (
    <DsComponentsScope>
      <main className={content}>
        <div className={header}>
          <div className={titles}>
            <h1 className={title}>Flows</h1>
            <p className={subtitle}>
              Processes that workers can monitor and manage
            </p>
          </div>
          {flows.length > 0 && (
            <div className={actions}>
              <div className={search}>
                <TextInput
                  size="sm"
                  value={searchText}
                  onChange={setSearchText}
                  placeholder="Search flows"
                  aria-label="Search flows"
                  prefix={{ iconName: "search", variant: "subtle" }}
                  clearable
                />
              </div>
              <NewFlowButton {...createFlow} />
            </div>
          )}
        </div>
        {noFlows ? (
          <FlowsEmptyState createFlow={createFlow} />
        ) : flows.length === 0 ? (
          <div className={loading}>
            <LoadingSpinner size="lg" />
          </div>
        ) : (
          <FlowsTable flows={matchingFlows} search={searchText.trim()} />
        )}
      </main>
    </DsComponentsScope>
  );
};

const FlowsPage: NextPageWithLayout = () => {
  return (
    <FlowDefinitionsContextProvider selectedFlowDefinitionEntityId={null}>
      <FlowsPageContent />
    </FlowDefinitionsContextProvider>
  );
};

FlowsPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default FlowsPage;

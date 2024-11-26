import type { VersionedUrl } from "@blockprotocol/type-system";
import { AlertModal } from "@hashintel/design-system";
import type { PropertyObject } from "@local/hash-graph-types/entity";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { blockProtocolEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useCallback, useContext, useEffect, useState } from "react";

import { useBlockProtocolCreateEntity } from "../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-create-entity";
import { PageErrorState } from "../../../../components/page-error-state";
import { Link } from "../../../../shared/ui/link";
import { WorkspaceContext } from "../../../shared/workspace-context";
import { EditBar } from "../../shared/edit-bar";
import { createDraftEntitySubgraph } from "./create-entity-page/use-draft-entity-subgraph";
import type { EntityEditorProps } from "./entity-editor";
import { EntityEditorPage } from "./entity-editor-page";
import { EntityPageLoadingState } from "./entity-page-loading-state";
import { updateEntitySubgraphStateByEntity } from "./shared/update-entity-subgraph-state-by-entity";
import { useApplyDraftLinkEntityChanges } from "./shared/use-apply-draft-link-entity-changes";
import { useDraftLinkState } from "./shared/use-draft-link-state";
import { useGetClosedMultiEntityType } from "./shared/use-get-closed-multi-entity-type";

interface CreateEntityPageProps {
  entityTypeId: VersionedUrl;
}

export const CreateEntityPage = ({ entityTypeId }: CreateEntityPageProps) => {
  const router = useRouter();
  const applyDraftLinkEntityChanges = useApplyDraftLinkEntityChanges();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [
    draftLinksToCreate,
    setDraftLinksToCreate,
    draftLinksToArchive,
    setDraftLinksToArchive,
  ] = useDraftLinkState();

  const { getClosedMultiEntityType, loading: closedTypeLoading } =
    useGetClosedMultiEntityType();

  const [draftEntityTypesDetails, setDraftEntityTypesDetails] =
    useState<
      Pick<
        EntityEditorProps,
        "closedMultiEntityType" | "closedMultiEntityTypesDefinitions"
      >
    >();

  const [draftEntitySubgraph, setDraftEntitySubgraph] = useState(() =>
    createDraftEntitySubgraph([entityTypeId]),
  );

  const fetchAndSetTypeDetails = useCallback(
    async (entityTypeIds: VersionedUrl[]) => {
      await getClosedMultiEntityType(entityTypeIds).then((result) => {
        setDraftEntityTypesDetails(result);
      });
    },
    [getClosedMultiEntityType],
  );

  useEffect(() => {
    void fetchAndSetTypeDetails([entityTypeId]);
  }, [entityTypeId, fetchAndSetTypeDetails]);

  const { activeWorkspace, activeWorkspaceOwnedById } =
    useContext(WorkspaceContext);
  const { createEntity } = useBlockProtocolCreateEntity(
    activeWorkspaceOwnedById ?? null,
  );

  const [creating, setCreating] = useState(false);

  /**
   * `overrideProperties` is a quick hack to bypass the setting draftEntity state
   * I did this, because I was having trouble with the `setDraftEntitySubgraph` function,
   * I tried calling handleCreateEntity after setting the draftEntity state, but state was not updating
   * @todo find a better way to do this
   */
  const handleCreateEntity = async (overrideProperties?: PropertyObject) => {
    if (!activeWorkspace) {
      return;
    }

    const draftEntity = getRoots(draftEntitySubgraph)[0];

    if (!draftEntity) {
      return;
    }

    try {
      setCreating(true);
      const { data: entity } = await createEntity({
        data: {
          entityTypeIds: [entityTypeId],
          properties: overrideProperties ?? draftEntity.properties,
        },
      });

      if (!entity) {
        return;
      }

      await applyDraftLinkEntityChanges(
        entity,
        draftLinksToCreate,
        draftLinksToArchive,
      );

      const entityId = extractEntityUuidFromEntityId(
        entity.metadata.recordId.entityId,
      );

      void router.push(`/@${activeWorkspace.shortname}/entities/${entityId}`);
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  if (!draftEntityTypesDetails && !closedTypeLoading) {
    return <EntityPageLoadingState />;
  }

  if (!draftEntityTypesDetails) {
    return <PageErrorState />;
  }

  const entityLabel = generateEntityLabel(draftEntitySubgraph);

  const isQueryEntity =
    entityTypeId === blockProtocolEntityTypes.query.entityTypeId;

  return (
    <>
      {errorMessage && (
        <AlertModal
          calloutMessage={errorMessage}
          close={() => setErrorMessage("")}
          header="Couldn't create entity"
          type="warning"
        >
          <Typography>
            Please <Link href="https://hash.ai/contact">contact us</Link> and
            tell us what entity you were trying to create when this happened
          </Typography>
        </AlertModal>
      )}
      <EntityEditorPage
        {...draftEntityTypesDetails}
        editBar={
          <EditBar
            label="- this entity has not been created yet"
            visible
            discardButtonProps={{
              href: "/new/entity",
              children: "Discard entity",
            }}
            confirmButtonProps={{
              onClick: () => handleCreateEntity(),
              loading: creating,
              children: "Create entity",
            }}
          />
        }
        entityLabel={entityLabel}
        entityUuid="draft"
        owner={`@${activeWorkspace?.shortname}`}
        isQueryEntity={isQueryEntity}
        isDirty
        isDraft
        handleSaveChanges={handleCreateEntity}
        setEntityTypes={async (newEntityTypeIds) => {
          const newDetails = await getClosedMultiEntityType(newEntityTypeIds);
          setDraftEntityTypesDetails(newDetails);
          setDraftEntitySubgraph(createDraftEntitySubgraph(newEntityTypeIds));
        }}
        setEntity={(changedEntity) => {
          updateEntitySubgraphStateByEntity(
            changedEntity,
            (updatedEntitySubgraphOrFunction) => {
              setDraftEntitySubgraph((prev) => {
                const updatedEntitySubgraph =
                  typeof updatedEntitySubgraphOrFunction === "function"
                    ? updatedEntitySubgraphOrFunction(prev)
                    : updatedEntitySubgraphOrFunction;

                return updatedEntitySubgraph ?? prev;
              });
            },
          );
        }}
        draftLinksToCreate={draftLinksToCreate}
        setDraftLinksToCreate={setDraftLinksToCreate}
        draftLinksToArchive={draftLinksToArchive}
        setDraftLinksToArchive={setDraftLinksToArchive}
        entitySubgraph={draftEntitySubgraph}
        readonly={false}
        onEntityUpdated={null}
      />
    </>
  );
};

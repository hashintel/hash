import { Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { Entity, Subgraph, SubgraphRootTypes } from "@hashintel/hash-subgraph";
import {
  EntityId,
  entityIdFromOwnedByIdAndEntityUuid,
  EntityUuid,
  OwnedById,
} from "@hashintel/hash-shared/types";
import Head from "next/head";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import { useBlockProtocolGetEntity } from "../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolGetEntity";
import {
  getLayoutWithSidebar,
  NextPageWithLayout,
} from "../../../shared/layout";
import { HashOntologyIcon } from "../shared/hash-ontology-icon";
import { OntologyChip } from "../shared/ontology-chip";
import { EntityEditor } from "./[entity-uuid].page/entity-editor";
import { EntityPageLoadingState } from "./[entity-uuid].page/entity-page-loading-state";
import { EntityPageWrapper } from "./[entity-uuid].page/entity-page-wrapper";
import { PageErrorState } from "../../../components/page-error-state";
import { generateEntityLabel } from "../../../lib/entities";
import { useRouteNamespace } from "../shared/use-route-namespace";
import { useBlockProtocolGetEntityType } from "../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolGetEntityType";
import { EntityPageHeader } from "./[entity-uuid].page/entity-page-wrapper/entity-page-header";
import { useBlockProtocolUpdateEntity } from "../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolUpdateEntity";
import { useLoadingCallback } from "../../../components/hooks/useLoadingCallback";
import { EditBarReusable } from "../types/entity-type/[entity-type-id].page/edit-bar-reusable";

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const entityUuid = router.query["entity-uuid"] as EntityUuid;
  const { routeNamespace } = useRouteNamespace();
  const { getEntity } = useBlockProtocolGetEntity();
  const { getEntityType } = useBlockProtocolGetEntityType();
  const { updateEntity } = useBlockProtocolUpdateEntity();

  const [entitySubgraphFromDB, setEntitySubgraphFromDB] =
    useState<Subgraph<SubgraphRootTypes["entity"]>>();
  const [draftEntitySubgraph, setDraftEntitySubgraph] =
    useState<Subgraph<SubgraphRootTypes["entity"]>>();

  const [isDirty, setIsDirty] = useState(false);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (routeNamespace) {
      const init = async () => {
        try {
          const { data: subgraph } = await getEntity({
            data: {
              entityId: entityIdFromOwnedByIdAndEntityUuid(
                routeNamespace.accountId as OwnedById,
                entityUuid,
              ),
            },
          });

          if (subgraph) {
            try {
              setEntitySubgraphFromDB(subgraph);
              setDraftEntitySubgraph(subgraph);
            } catch {
              setEntitySubgraphFromDB(undefined);
            }
          }
        } finally {
          setLoading(false);
        }
      };

      void init();
    }
  }, [entityUuid, getEntity, getEntityType, routeNamespace]);

  const refetch = async () => {
    if (!routeNamespace) {
      return;
    }

    const { data: subgraph } = await getEntity({
      data: {
        entityId: entityIdFromOwnedByIdAndEntityUuid(
          routeNamespace.accountId as OwnedById,
          entityUuid,
        ),
      },
    });

    setEntitySubgraphFromDB(subgraph);
  };

  const discardChanges = () => {
    setIsDirty(false);
    setDraftEntitySubgraph(entitySubgraphFromDB);
  };

  const [handleSaveChanges, savingChanges] = useLoadingCallback(async () => {
    if (!entitySubgraphFromDB || !draftEntitySubgraph) {
      return;
    }

    const entity = getRoots(entitySubgraphFromDB)[0];
    const draftEntity = getRoots(draftEntitySubgraph)[0];

    if (!entity || !draftEntity) {
      return;
    }

    /** @todo add validation here */
    await updateEntity({
      data: {
        entityId: entity.metadata.editionId.baseId as EntityId,
        updatedProperties: draftEntity.properties,
      },
    });
    setIsDirty(false);
  });

  if (loading) {
    return <EntityPageLoadingState />;
  }

  if (!draftEntitySubgraph) {
    return <PageErrorState />;
  }

  const entityLabel = generateEntityLabel(draftEntitySubgraph);

  return (
    <>
      <Head>
        <title>{entityLabel} | Entity | HASH</title>
      </Head>
      <EntityPageWrapper
        header={
          <EntityPageHeader
            entityLabel={entityLabel}
            editBar={
              <EditBarReusable
                visible={isDirty}
                discardButtonProps={{
                  onClick: discardChanges,
                }}
                confirmButtonProps={{
                  onClick: handleSaveChanges,
                  loading: savingChanges,
                  children: "Save changes",
                }}
              />
            }
            chip={
              <OntologyChip
                icon={<HashOntologyIcon />}
                domain="hash.ai"
                path={
                  <Typography>
                    <Typography
                      color={(theme) => theme.palette.blue[70]}
                      component="span"
                      fontWeight="bold"
                    >
                      {router.query.shortname}
                    </Typography>
                    <Typography
                      color={(theme) => theme.palette.blue[70]}
                      component="span"
                    >
                      /entities/
                    </Typography>
                    <Typography
                      color={(theme) => theme.palette.blue[70]}
                      component="span"
                      fontWeight="bold"
                    >
                      {entityUuid}
                    </Typography>
                  </Typography>
                }
              />
            }
          />
        }
      >
        <EntityEditor
          entitySubgraph={draftEntitySubgraph}
          setEntity={(entity) => {
            setIsDirty(true);
            setDraftEntitySubgraph((entityAndSubgraph) => {
              if (entity) {
                /**
                 * @todo - This is a problem, subgraphs should probably be immutable, there will be a new identifier
                 *   for the updated entity. This version will not match the one returned by the data store.
                 *   For places where we mutate elements, we should probably store them separately from the subgraph to
                 *   allow for optimistic updates without being incorrect.
                 */
                const newEntity = JSON.parse(JSON.stringify(entity)) as Entity;
                const newEntityVersion = new Date().toISOString();
                newEntity.metadata.editionId.version = newEntityVersion;

                return entityAndSubgraph
                  ? ({
                      ...entityAndSubgraph,
                      roots: [newEntity.metadata.editionId],
                      vertices: {
                        ...entityAndSubgraph.vertices,
                        [newEntity.metadata.editionId.baseId]: {
                          ...entityAndSubgraph.vertices[
                            newEntity.metadata.editionId.baseId
                          ],
                          [newEntityVersion]: {
                            kind: "entity",
                            inner: newEntity,
                          },
                        },
                      },
                    } as Subgraph<SubgraphRootTypes["entity"]>)
                  : undefined;
              } else {
                return undefined;
              }
            });
          }}
          refetch={refetch}
        />
      </EntityPageWrapper>
    </>
  );
};

Page.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default Page;

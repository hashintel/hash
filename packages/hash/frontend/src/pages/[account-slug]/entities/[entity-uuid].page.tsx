import { Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import {
  entityIdFromOwnedByIdAndEntityUuid,
  Entity,
  Subgraph,
  SubgraphRootTypes,
} from "@hashintel/hash-subgraph";
import Head from "next/head";
import slugify from "slugify";
import { useBlockProtocolGetEntity } from "../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolGetEntity";
import { useLoggedInUser } from "../../../components/hooks/useAuthenticatedUser";
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
import { useRouteNamespace } from "../types/entity-type/use-route-namespace";
import { useBlockProtocolGetEntityType } from "../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolGetEntityType";
import { EntityPageHeader } from "./[entity-uuid].page/entity-page-wrapper/entity-page-header";

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const entityUuid = router.query["entity-uuid"] as string;
  const { routeNamespace } = useRouteNamespace();
  const { authenticatedUser } = useLoggedInUser();
  const { getEntity } = useBlockProtocolGetEntity();
  const { getEntityType } = useBlockProtocolGetEntityType();

  const [entitySubgraph, setEntitySubgraph] =
    useState<Subgraph<SubgraphRootTypes["entity"]>>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (routeNamespace) {
      const init = async () => {
        try {
          const { data: subgraph } = await getEntity({
            data: {
              entityId: entityIdFromOwnedByIdAndEntityUuid(
                routeNamespace.accountId,
                entityUuid,
              ),
            },
          });

          if (subgraph) {
            try {
              setEntitySubgraph(subgraph);
            } catch {
              setEntitySubgraph(undefined);
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
          routeNamespace.accountId,
          entityUuid,
        ),
      },
    });

    setEntitySubgraph(subgraph);
  };

  if (!authenticatedUser) {
    return null;
  }

  if (loading) {
    return <EntityPageLoadingState />;
  }

  if (!entitySubgraph) {
    return <PageErrorState />;
  }

  const entityLabel = generateEntityLabel(entitySubgraph);

  return (
    <>
      <Head>
        <title>{entityLabel} | Entity | HASH</title>
      </Head>
      <EntityPageWrapper
        header={
          <EntityPageHeader
            entityLabel={entityLabel}
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
                      {router.query["account-slug"]}
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
          entitySubgraph={entitySubgraph}
          setEntity={(entity) =>
            setEntitySubgraph((entityAndSubgraph) => {
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
            })
          }
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

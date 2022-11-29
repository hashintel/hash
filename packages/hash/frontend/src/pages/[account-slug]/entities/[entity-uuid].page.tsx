import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import {
  entityIdFromOwnedByIdAndEntityUuid,
  Entity,
  Subgraph,
  SubgraphRootTypes,
} from "@hashintel/hash-subgraph";
import { useBlockProtocolGetEntity } from "../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolGetEntity";
import { useLoggedInUser } from "../../../components/hooks/useAuthenticatedUser";
import {
  getLayoutWithSidebar,
  NextPageWithLayout,
} from "../../../shared/layout";
import { EntityEditor } from "./[entity-uuid].page/entity-editor";
import { EntityPageLoadingState } from "./[entity-uuid].page/entity-page-loading-state";
import { EntityPageWrapper } from "./[entity-uuid].page/entity-page-wrapper";
import { PageErrorState } from "../../../components/page-error-state";
/** @todo - This should be moved somewhere shared */
import { useRouteNamespace } from "../types/entity-type/use-route-namespace";
import { generateEntityLabel } from "../../../lib/entities";

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const { namespace } = useRouteNamespace();
  const { authenticatedUser } = useLoggedInUser();
  const { getEntity } = useBlockProtocolGetEntity();

  const [entitySubgraph, setEntitySubgraph] =
    useState<Subgraph<SubgraphRootTypes["entity"]>>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (namespace) {
      const init = async () => {
        try {
          const entityUuid = router.query["entity-uuid"] as string;

          const { data: subgraph } = await getEntity({
            data: entityIdFromOwnedByIdAndEntityUuid(
              namespace.accountId,
              entityUuid,
            ),
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
  }, [namespace, router.query, getEntity]);

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
    <EntityPageWrapper label={entityLabel}>
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
      />
    </EntityPageWrapper>
  );
};

Page.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default Page;

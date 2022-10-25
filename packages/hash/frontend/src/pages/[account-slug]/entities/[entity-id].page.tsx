import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useBlockProtocolGetEntity } from "../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolGetEntity";
import { useLoggedInUser } from "../../../components/hooks/useUser";
import { getPlainLayout, NextPageWithLayout } from "../../../shared/layout";
import { EntityEditor } from "./[entity-id].page/entity-editor";
import { EntityPageLoadingState } from "./[entity-id].page/entity-page-loading-state";
import { EntityPageWrapper } from "./[entity-id].page/entity-page-wrapper";
import {
  isSingleEntityRootedSubgraph,
  SingleEntityRootedSubgraph,
} from "../../../lib/subgraph";

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const { user } = useLoggedInUser();
  const { getEntity } = useBlockProtocolGetEntity();

  const [entityRootedSubgraph, setEntityRootedSubgraph] =
    useState<SingleEntityRootedSubgraph>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        const entityId = router.query["entity-id"] as string;

        const { data: subgraph } = await getEntity({ data: { entityId } });

        /** @todo - error handling, this will throw if entity doesn't exist */
        if (subgraph && isSingleEntityRootedSubgraph(subgraph)) {
          setEntityRootedSubgraph(subgraph);
        }
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, [router.query, getEntity]);

  if (!user) {
    return null;
  }

  if (loading) {
    return <EntityPageLoadingState />;
  }

  if (!entityRootedSubgraph) {
    return <h1>Entity not found</h1>;
  }

  return (
    <EntityPageWrapper entityRootedSubgraph={entityRootedSubgraph}>
      <EntityEditor
        entityRootedSubgraph={entityRootedSubgraph}
        setEntity={(entity) =>
          setEntityRootedSubgraph((subgraph) => {
            return subgraph && entity
              ? {
                  ...subgraph,
                  vertices: {
                    ...subgraph.vertices,
                    /**
                     * @todo - This is a problem, entity records should be immutable, there will be a new identifier
                     *   for the updated entity. For places where we mutate elements, we should probably store them
                     *   separately from the subgraph to allow for optimistic updates without being incorrect.
                     */
                    [entity.entityId]: {
                      kind: "entity",
                      inner: entity,
                    },
                  },
                }
              : undefined;
          })
        }
      />
    </EntityPageWrapper>
  );
};

Page.getLayout = getPlainLayout;

export default Page;

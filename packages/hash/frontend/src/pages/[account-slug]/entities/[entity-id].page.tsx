import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useBlockProtocolGetEntity } from "../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolGetEntity";
import { useLoggedInUser } from "../../../components/hooks/useUser";
import { getPlainLayout, NextPageWithLayout } from "../../../shared/layout";
import { EntityEditor } from "./[entity-id].page/entity-editor";
import { EntityPageLoadingState } from "./[entity-id].page/entity-page-loading-state";
import { EntityPageWrapper } from "./[entity-id].page/entity-page-wrapper";
import { Subgraph } from "../../../lib/subgraph";

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const { user } = useLoggedInUser();
  const { getEntity } = useBlockProtocolGetEntity();

  const [entityRootedSubgraph, setEntityRootedSubgraph] = useState<Subgraph>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        const entityId = router.query["entity-id"] as string;

        const subgraph = (await getEntity({ data: { entityId } })).data;

        setEntityRootedSubgraph(subgraph);
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

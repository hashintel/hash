import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { EntityResponse } from "../../../components/hooks/blockProtocolFunctions/knowledge/knowledge-shim";
import { useBlockProtocolGetEntity } from "../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolGetEntity";
import { useLoggedInUser } from "../../../components/hooks/useUser";
import { getPlainLayout, NextPageWithLayout } from "../../../shared/layout";
import { EntityEditor } from "./[entity-id].page/entity-editor";
import { EntityPageLoadingState } from "./[entity-id].page/entity-page-loading-state";
import { EntityPageWrapper } from "./[entity-id].page/entity-page-wrapper";

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const { user } = useLoggedInUser();
  const { getEntity } = useBlockProtocolGetEntity();

  const [entity, setEntity] = useState<EntityResponse>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        const entityId = router.query["entity-id"] as string;

        const res = await getEntity({ data: { entityId } });

        setEntity(res.data);
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

  if (!entity) {
    return <h1>Entity not found</h1>;
  }

  return (
    <EntityPageWrapper entity={entity}>
      <EntityEditor entity={entity} setEntity={setEntity} />
    </EntityPageWrapper>
  );
};

Page.getLayout = getPlainLayout;

export default Page;

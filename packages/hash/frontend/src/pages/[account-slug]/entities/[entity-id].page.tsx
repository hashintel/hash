import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { EntityResponse } from "../../../components/hooks/blockProtocolFunctions/knowledge/knowledge-shim";
import { useBlockProtocolGetEntity } from "../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolGetEntity";
import { getPlainLayout, NextPageWithLayout } from "../../../shared/layout";
import { EntityPageWrapper } from "./[entity-id].page/entity-page-wrapper";
import { LinksSection } from "./[entity-id].page/links-section";
import { PeersSection } from "./[entity-id].page/peers-section";
import { PropertiesSection } from "./[entity-id].page/properties-section";
import { TypesSection } from "./[entity-id].page/types-section";

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const { getEntity } = useBlockProtocolGetEntity();
  const [entity, setEntity] = useState<EntityResponse | undefined>(undefined);

  useEffect(() => {
    const init = async () => {
      const entityId = router.query["entity-id"] as string;

      const res = await getEntity({ data: { entityId } });

      setEntity(res.data);
    };

    void init();
  }, [router.query, getEntity]);

  if (!entity) return <h1>Loading...</h1>;

  return (
    <EntityPageWrapper>
      <TypesSection entity={entity} />

      <PropertiesSection entity={entity} />

      <LinksSection />

      <PeersSection />
    </EntityPageWrapper>
  );
};

Page.getLayout = getPlainLayout;

export default Page;

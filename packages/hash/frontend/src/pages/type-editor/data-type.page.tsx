import { useEffect } from "react";
import { useRouter } from "next/router";
import { Container } from "@mui/material";
import { BlockProtocolFunctions } from "blockprotocol";

import { useUser } from "../../components/hooks/useUser";
import { NextPageWithLayout } from "../../shared/layout";

import { useBlockProtocolCreateEntityTypes } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolCreateEntityTypes";
import { useBlockProtocolCreateEntities } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolCreateEntitities";
import { useBlockProtocolCreateLinks } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolCreateLinks";
import { useBlockProtocolDeleteLinks } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolDeleteLinks";
import { useBlockProtocolUpdateLinks } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolUpdateLinks";
import { useBlockProtocolCreateLinkedAggregations } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolCreateLinkedAggregations";
import { useBlockProtocolUpdateLinkedAggregations } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolUpdateLinkedAggregations";
import { useBlockProtocolDeleteLinkedAggregations } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolDeleteLinkedAggregations";
import { useBlockProtocolAggregateEntityTypes } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolAggregateEntityTypes";
import { useBlockProtocolAggregateEntities } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolAggregateEntities";
import { useBlockProtocolUpdateEntities } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolUpdateEntities";
import { useFileUpload } from "../../components/hooks/useFileUpload";

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const { user, loading, kratosSession } = useUser();

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!kratosSession) {
      void router.push("/login");
    }
  }, [loading, router, user, kratosSession]);

  const functions = useBlockProtocolFunctions();

  return loading ? (
    <Container sx={{ pt: 10 }}>Loading...</Container>
  ) : (
    <Container sx={{ pt: 10 }}>Hello!</Container>
  );
};

export default Page;
const useBlockProtocolFunctions = (): BlockProtocolFunctions => {
  const { aggregateEntityTypes } = useBlockProtocolAggregateEntityTypes();
  const { aggregateEntities } = useBlockProtocolAggregateEntities();
  const { createLinkedAggregations } =
    useBlockProtocolCreateLinkedAggregations();
  const { createLinks } = useBlockProtocolCreateLinks();
  const { createEntities } = useBlockProtocolCreateEntities();
  const { createEntityTypes } = useBlockProtocolCreateEntityTypes();
  const { deleteLinkedAggregations } =
    useBlockProtocolDeleteLinkedAggregations();
  const { deleteLinks } = useBlockProtocolDeleteLinks();
  const { updateEntities } = useBlockProtocolUpdateEntities();
  const { uploadFile } = useFileUpload();
  const { updateLinkedAggregations } =
    useBlockProtocolUpdateLinkedAggregations();
  const { updateLinks } = useBlockProtocolUpdateLinks();

  return {
    aggregateEntityTypes,
    aggregateEntities,
    createEntities,
    createEntityTypes,
    createLinkedAggregations,
    createLinks,
    deleteLinkedAggregations,
    deleteLinks,
    updateEntities,
    uploadFile,
    updateLinks,
    updateLinkedAggregations,
  };
};

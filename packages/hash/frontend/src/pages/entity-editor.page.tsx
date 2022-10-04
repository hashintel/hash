import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Container } from "@mui/material";
import init from "@blockprotocol/type-system-web";

import { useUser } from "../components/hooks/useUser";
import { NextPageWithLayout } from "../shared/layout";
import { useBlockProtocolFunctionsWithOntology } from "./type-editor/blockprotocol-ontology-functions-hook";

/**
 * This component is an example usage of the `getEntity` BP function.
 * This is meant to be removed as soon as it's unneeded.
 */
const ExampleUsage = ({ ownedById }: { ownedById: string }) => {
  const { user } = useUser();
  const [content, setContent] = useState<string>();

  const { getEntity } = useBlockProtocolFunctionsWithOntology(ownedById);

  useEffect(() => {
    if (user) {
      // As an example entity, we are going to use the currenlty logged in user's entity id
      const entityId = user.entityId;

      void getEntity({ data: { entityId } }).then(({ data: entity }) => {
        setContent(JSON.stringify(entity ?? {}, null, 2));
      });
    }
  }, [user, getEntity]);

  return (
    <Container>
      <pre style={{ overflowX: "scroll" }}>{content}</pre>
    </Container>
  );
};

const ExampleEntityEditorPage: NextPageWithLayout = () => {
  const router = useRouter();
  // The user is important to allow using Block Protocol functions
  // such as: `const functions = useBlockProtocolFunctionsWithOntology(user.accountId);`
  const { user, loading: loadingUser, kratosSession } = useUser();
  const [loadingTypeSystem, setLoadingTypeSystem] = useState(true);

  useEffect(() => {
    if (loadingTypeSystem) {
      void (async () => {
        await init().then(() => {
          setLoadingTypeSystem(false);
        });
      })();
    }
  }, [loadingTypeSystem, setLoadingTypeSystem]);

  useEffect(() => {
    if (!loadingUser && !kratosSession) {
      void router.push("/login");
    }
  }, [loadingUser, router, kratosSession]);

  return loadingUser || !user || loadingTypeSystem ? (
    <Container sx={{ pt: 10 }}>Loading...</Container>
  ) : (
    <Container sx={{ pt: 10 }}>
      Hello!
      <ExampleUsage ownedById={user.accountId} />
    </Container>
  );
};

export default ExampleEntityEditorPage;

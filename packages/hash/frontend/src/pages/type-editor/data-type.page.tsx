import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Container } from "@mui/material";

import { useUser } from "../../components/hooks/useUser";
import { NextPageWithLayout } from "../../shared/layout";
import { useBlockProtocolFunctionsWithOntology } from "./blockprotocol-ontology-functions-hook";
import {
  AggregateDataTypesMessageCallback,
  AggregateEntityTypesMessageCallback,
  AggregateLinkTypesMessageCallback,
  AggregatePropertyTypesMessageCallback,
} from "../../components/hooks/blockProtocolFunctions/ontology/ontology-types-shim";

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const { user, loading, kratosSession } = useUser();
  const [content, setContent] = useState<string>();

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!kratosSession && !user) {
      void router.push("/login");
    }
  }, [loading, router, user, kratosSession]);

  /** @todo use the User's accountId here. */
  const functions = useBlockProtocolFunctionsWithOntology("..");

  const getType = useCallback(
    (
        fn:
          | AggregateDataTypesMessageCallback
          | AggregatePropertyTypesMessageCallback
          | AggregateEntityTypesMessageCallback
          | AggregateLinkTypesMessageCallback,
      ) =>
      (_: any) => {
        void (async () => {
          const result = await fn({ data: {} });
          setContent(JSON.stringify(result.data ?? {}, null, 2));
        })();
      },
    [setContent],
  );

  return loading ? (
    <Container sx={{ pt: 10 }}>Loading...</Container>
  ) : (
    <Container sx={{ pt: 10 }}>
      Hello!
      <br />
      <button type="button" onClick={getType(functions.aggregateDataTypes)}>
        Get data types
      </button>
      <br />
      <button type="button" onClick={getType(functions.aggregatePropertyTypes)}>
        Get property types
      </button>
      <br />
      <button type="button" onClick={getType(functions.aggregateEntityTypes)}>
        Get entity types
      </button>
      <br />
      <button type="button" onClick={getType(functions.aggregateLinkTypes)}>
        Get link types
      </button>
      <pre>{content}</pre>
    </Container>
  );
};

export default Page;

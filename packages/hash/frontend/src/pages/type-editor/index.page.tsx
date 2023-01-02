import { types } from "@hashintel/hash-shared/ontology-types";
import { AccountId, OwnedById } from "@hashintel/hash-shared/types";
import { Box, Container } from "@mui/material";
import { useCallback, useState } from "react";

import {
  AggregateDataTypesMessageCallback,
  AggregateEntityTypesMessageCallback,
  AggregatePropertyTypesMessageCallback,
} from "../../components/hooks/block-protocol-functions/ontology/ontology-types-shim";
import { useInitTypeSystem } from "../../lib/use-init-type-system";
import { NextPageWithLayout } from "../../shared/layout";
import { Button } from "../../shared/ui";
import { useAuthenticatedUser } from "../shared/auth-info-context";
import { useBlockProtocolFunctionsWithOntology } from "./blockprotocol-ontology-functions-hook";

/**
 * This component is an example usage of the new functions.
 * This is meant to be removed as soon as it's unneeded.
 */
const ExampleUsage = ({ accountId }: { accountId: AccountId }) => {
  const [content, setContent] = useState<string>();

  const functions = useBlockProtocolFunctionsWithOntology(
    accountId as OwnedById,
  );

  const getType = useCallback(
    (
        fn:
          | AggregateDataTypesMessageCallback
          | AggregatePropertyTypesMessageCallback
          | AggregateEntityTypesMessageCallback,
      ) =>
      (_: any) => {
        void (async () => {
          const result = await fn({ data: {} });
          setContent(JSON.stringify(result.data ?? {}, null, 2));
        })();
      },
    [setContent],
  );

  const createPropertyType = useCallback(() => {
    void (async () => {
      await functions
        .createPropertyType({
          data: {
            propertyType: {
              kind: "propertyType",
              title: "Name",
              oneOf: [{ $ref: types.dataType.text.dataTypeId }],
            },
          },
        })
        .then((result) => {
          setContent(JSON.stringify(result.data ?? {}, null, 2));
        })
        .catch((error) => {
          setContent(JSON.stringify(error ?? {}, null, 2));
        });
    })();
  }, [functions, setContent]);

  return (
    <Container>
      Test the methods!
      <br />
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
        }}
      >
        <Button size="medium" onClick={getType(functions.aggregateDataTypes)}>
          Get data types
        </Button>

        <Button
          size="medium"
          onClick={getType(functions.aggregatePropertyTypes)}
        >
          Get property types
        </Button>

        <Button size="medium" onClick={getType(functions.aggregateEntityTypes)}>
          Get entity types
        </Button>

        <div>
          <br />

          <Button size="medium" onClick={createPropertyType}>
            Create property type
          </Button>
        </div>
      </Box>
      <pre style={{ overflowX: "scroll" }}>{content}</pre>
    </Container>
  );
};

/**
 * The entry point for dealing with the type editors.
 */
const Page: NextPageWithLayout = () => {
  // The user is important to allow using Block Protocol functions
  // such as: `const functions = useBlockProtocolFunctionsWithOntology(user.accountId);`
  const { authenticatedUser } = useAuthenticatedUser();
  const loadingTypeSystem = useInitTypeSystem();

  return loadingTypeSystem ? (
    <Container sx={{ pt: 10 }}>Loading...</Container>
  ) : (
    <Container sx={{ pt: 10 }}>
      Hello!
      <ExampleUsage accountId={authenticatedUser.accountId} />
    </Container>
  );
};

export default Page;

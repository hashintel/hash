import { Box, Container } from "@mui/material";
import { useCallback, useState } from "react";
import {
  AggregateDataTypesMessageCallback,
  AggregateEntityTypesMessageCallback,
  AggregateLinkTypesMessageCallback,
  AggregatePropertyTypesMessageCallback,
} from "../../components/hooks/blockProtocolFunctions/ontology/ontology-types-shim";
import { useLoggedInUser } from "../../components/hooks/useUser";
import { NextPageWithLayout } from "../../shared/layout";

import { Button } from "../../shared/ui";
import { useBlockProtocolFunctionsWithOntology } from "./blockprotocol-ontology-functions-hook";

/**
 * This component is an example usage of the new functions.
 * This is meant to be removed as soon as it's unneeded.
 */
const ExampleUsage = ({ accountId }: { accountId: string }) => {
  const [content, setContent] = useState<string>();

  const functions = useBlockProtocolFunctionsWithOntology(accountId);

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

  const createPropertyType = useCallback(() => {
    void (async () => {
      await functions
        .createPropertyType({
          data: {
            propertyType: {
              kind: "propertyType",
              title: "Name",
              pluralTitle: "Names",
              oneOf: [
                {
                  $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                },
              ],
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

        <Button size="medium" onClick={getType(functions.aggregateLinkTypes)}>
          Get link types
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
  const { user, loading: loadingUser } = useLoggedInUser();

  return loadingUser || !user ? (
    <Container sx={{ pt: 10 }}>Loading...</Container>
  ) : (
    <Container sx={{ pt: 10 }}>
      Hello!
      <ExampleUsage accountId={user.accountId} />
    </Container>
  );
};

export default Page;
